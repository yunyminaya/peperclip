import React, { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Umbral de longitud de cadena a partir del cual se usa un Textarea en lugar de un Input estándar.
 */
const TEXTAREA_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Subconjunto de propiedades de JSON Schema que entendemos para renderizar formularios.
 * Intencionalmente lo mantenemos suelto (`Record<string, unknown>`) en el nivel superior
 * para coincidir con el tipo `JsonSchema` en shared, pero lo estrechamos internamente.
 */
export interface JsonSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: string;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Object
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;

  // Array
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;

  // Metadata
  readOnly?: boolean;
  writeOnly?: boolean;

  // Allow extra keys
  [key: string]: unknown;
}

export interface JsonSchemaFormProps {
  /** El JSON Schema a renderizar. */
  schema: JsonSchemaNode;
  /** Valores actuales del formulario. */
  values: Record<string, unknown>;
  /** Se llama cada vez que cambia el valor de un campo. */
  onChange: (values: Record<string, unknown>) => void;
  /** Errores de validación indexados por ruta de puntero JSON (p. ej. "/apiKey"). */
  errors?: Record<string, string>;
  /** Si es true, todos los campos están deshabilitados. */
  disabled?: boolean;
  /** Clase CSS adicional para el contenedor raíz. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Funciones auxiliares
// ---------------------------------------------------------------------------

/** Resuelve la cadena de tipo principal de un nodo de schema. */
export function resolveType(schema: JsonSchemaNode): string {
  if (schema.enum) return "enum";
  if (schema.const !== undefined) return "const";
  if (schema.format === "secret-ref") return "secret-ref";
  if (Array.isArray(schema.type)) {
    // Usar el primer tipo no nulo
    return schema.type.find((t) => t !== "null") ?? "string";
  }
  return schema.type ?? "string";
}

/** Etiqueta legible a partir del título del schema o la clave de propiedad. */
export function labelFromKey(key: string, schema: JsonSchemaNode): string {
  if (schema.title) return schema.title;
  // Convertir camelCase / snake_case a Mayúsculas Iniciales
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Produce un valor predeterminado sensato para un nodo de schema. */
export function getDefaultForSchema(schema: JsonSchemaNode): unknown {
  if (schema.default !== undefined) return schema.default;

  const type = resolveType(schema);
  switch (type) {
    case "string":
    case "secret-ref":
      return "";
    case "number":
    case "integer":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    case "enum":
      return schema.enum?.[0] ?? "";
    case "array":
      return [];
    case "object": {
      if (!schema.properties) return {};
      const obj: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        obj[key] = getDefaultForSchema(propSchema);
      }
      return obj;
    }
    default:
      return "";
  }
}

/** Valida el valor de un campo contra las restricciones del schema. Devuelve el error o null. */
export function validateField(
  value: unknown,
  schema: JsonSchemaNode,
  isRequired: boolean,
): string | null {
  const type = resolveType(schema);

  // Verificación de requerido
  if (isRequired && (value === undefined || value === null || value === "")) {
    return "Este campo es obligatorio";
  }

  // Omitir más validación si está vacío y no es requerido
  if (value === undefined || value === null || value === "") return null;

  if (type === "string" || type === "secret-ref") {
    const str = String(value);
    if (schema.minLength != null && str.length < schema.minLength) {
      return `Debe tener al menos ${schema.minLength} caracteres`;
    }
    if (schema.maxLength != null && str.length > schema.maxLength) {
      return `Debe tener como máximo ${schema.maxLength} caracteres`;
    }
    if (schema.pattern) {
      // Protección contra ReDoS: rechazar patrones demasiado complejos de los JSON Schemas de plugins.
      // Limitar la longitud del patrón y ejecutar la regex con un try/catch defensivo.
      const MAX_PATTERN_LENGTH = 512;
      if (schema.pattern.length <= MAX_PATTERN_LENGTH) {
        try {
          const re = new RegExp(schema.pattern);
          if (!re.test(str)) {
            return `Debe coincidir con el patrón: ${schema.pattern}`;
          }
        } catch {
          // Regex inválida en el schema — omitir
        }
      }
    }
  }

  if (type === "number" || type === "integer") {
    const num = Number(value);
    if (isNaN(num)) return "Debe ser un número válido";
    if (schema.minimum != null && num < schema.minimum) {
      return `Debe ser al menos ${schema.minimum}`;
    }
    if (schema.maximum != null && num > schema.maximum) {
      return `Debe ser como máximo ${schema.maximum}`;
    }
    if (schema.exclusiveMinimum != null && num <= schema.exclusiveMinimum) {
      return `Debe ser mayor que ${schema.exclusiveMinimum}`;
    }
    if (schema.exclusiveMaximum != null && num >= schema.exclusiveMaximum) {
      return `Debe ser menor que ${schema.exclusiveMaximum}`;
    }
    if (type === "integer" && !Number.isInteger(num)) {
      return "Debe ser un número entero";
    }
    if (schema.multipleOf != null && num % schema.multipleOf !== 0) {
      return `Debe ser múltiplo de ${schema.multipleOf}`;
    }
  }

  if (type === "array") {
    const arr = value as unknown[];
    if (schema.minItems != null && arr.length < schema.minItems) {
      return `Debe tener al menos ${schema.minItems} elementos`;
    }
    if (schema.maxItems != null && arr.length > schema.maxItems) {
      return `Debe tener como máximo ${schema.maxItems} elementos`;
    }
  }

  return null;
}

/** API pública para validación */
export function validateJsonSchemaForm(
  schema: JsonSchemaNode,
  values: Record<string, unknown>,
  path: string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const properties = schema.properties ?? {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [key, propSchema] of Object.entries(properties)) {
    const fieldPath = [...path, key];
    const errorKey = `/${fieldPath.join("/")}`;
    const value = values[key];
    const isRequired = requiredFields.has(key);
    const type = resolveType(propSchema);

    // Validación por campo
    const fieldErr = validateField(value, propSchema, isRequired);
    if (fieldErr) {
      errors[errorKey] = fieldErr;
    }

    // Recurrir en objetos
    if (type === "object" && propSchema.properties && typeof value === "object" && value !== null) {
      Object.assign(
        errors,
        validateJsonSchemaForm(propSchema, value as Record<string, unknown>, fieldPath),
      );
    }

    // Recurrir en arreglos
    if (type === "array" && propSchema.items && Array.isArray(value)) {
      const itemSchema = propSchema.items as JsonSchemaNode;
      const isObjectItem = resolveType(itemSchema) === "object";

      value.forEach((item, index) => {
        const itemPath = [...fieldPath, String(index)];
        const itemErrorKey = `/${itemPath.join("/")}`;

        if (isObjectItem) {
          Object.assign(
            errors,
            validateJsonSchemaForm(
              itemSchema,
              item as Record<string, unknown>,
              itemPath,
            ),
          );
        } else {
          const itemErr = validateField(item, itemSchema, false);
          if (itemErr) {
            errors[itemErrorKey] = itemErr;
          }
        }
      });
    }
  }

  return errors;
}

/** API pública para valores predeterminados */
export function getDefaultValues(schema: JsonSchemaNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const properties = schema.properties ?? {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const def = getDefaultForSchema(propSchema);
    if (def !== undefined) {
      result[key] = def;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Componentes internos
// ---------------------------------------------------------------------------

interface FieldWrapperProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Envoltorio común para campos de formulario que maneja etiquetas, descripciones y mensajes de error.
 */
const FieldWrapper = React.memo(({
  label,
  description,
  required,
  error,
  disabled,
  children,
}: FieldWrapperProps) => {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        {label && (
          <Label className="text-sm font-medium">
            {label}
            {required && <span className="ml-1 text-destructive">*</span>}
          </Label>
        )}
      </div>
      {children}
      {description && (
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {error && (
        <p className="text-[12px] font-medium text-destructive">{error}</p>
      )}
    </div>
  );
});

FieldWrapper.displayName = "FieldWrapper";

interface FormFieldProps {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
  disabled?: boolean;
  label: string;
  isRequired?: boolean;
  errors: Record<string, string>; // necesario para la recursión
  path: string; // necesario para filtrar errores en la recursión
}

/**
 * Campo especializado para valores booleanos (checkbox).
 */
const BooleanField = React.memo(({
  id,
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
}: {
  id: string;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
}) => (
  <div className="flex items-start space-x-3 space-y-0">
    <Checkbox
      id={id}
      checked={!!value}
      onCheckedChange={onChange}
      disabled={disabled}
    />
    <div className="grid gap-1.5 leading-none">
      {label && (
        <Label
          htmlFor={id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
          {isRequired && <span className="ml-1 text-destructive">*</span>}
        </Label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  </div>
));

BooleanField.displayName = "BooleanField";

/**
 * Campo especializado para valores enum (select).
 */
const EnumField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  options,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  options: unknown[];
}) => (
  <FieldWrapper
    label={label}
    description={description}
    required={isRequired}
    error={error}
    disabled={disabled}
  >
    <Select
      value={String(value ?? "")}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecciona una opción" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={String(option)} value={String(option)}>
            {String(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </FieldWrapper>
));

EnumField.displayName = "EnumField";

/**
 * Campo especializado para valores secret-ref, con un input de contraseña conmutable.
 */
const SecretField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <FieldWrapper
      label={label}
      description={
        description ||
        "Este secreto se almacena de forma segura mediante el proveedor de secretos de Paperclip."
      }
      required={isRequired}
      error={error}
      disabled={disabled}
    >
      <div className="relative">
        <Input
          type={isVisible ? "text" : "password"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          className="pr-10"
          aria-invalid={!!error}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={() => setIsVisible(!isVisible)}
          disabled={disabled}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="sr-only">
            {isVisible ? "Ocultar secreto" : "Mostrar secreto"}
          </span>
        </Button>
      </div>
    </FieldWrapper>
  );
});

SecretField.displayName = "SecretField";

/**
 * Campo especializado para valores numéricos (number/integer).
 */
const NumberField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
  type,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
  type: "number" | "integer";
}) => (
  <FieldWrapper
    label={label}
    description={description}
    required={isRequired}
    error={error}
    disabled={disabled}
  >
    <Input
      type="number"
      step={type === "integer" ? "1" : "any"}
      value={value !== undefined ? String(value) : ""}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === "" ? undefined : Number(val));
      }}
      placeholder={String(defaultValue ?? "")}
      disabled={disabled}
      aria-invalid={!!error}
    />
  </FieldWrapper>
));

NumberField.displayName = "NumberField";

/**
 * Campo especializado para valores de cadena, renderizando un Input o Textarea según la longitud o el formato.
 */
const StringField = React.memo(({
  value,
  onChange,
  disabled,
  label,
  isRequired,
  description,
  error,
  defaultValue,
  format,
  maxLength,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  isRequired?: boolean;
  description?: string;
  error?: string;
  defaultValue?: unknown;
  format?: string;
  maxLength?: number;
}) => {
  const isTextArea = format === "textarea" || (maxLength && maxLength > TEXTAREA_THRESHOLD);
  return (
    <FieldWrapper
      label={label}
      description={description}
      required={isRequired}
      error={error}
      disabled={disabled}
    >
      {isTextArea ? (
        <Textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          className="min-h-[100px]"
          aria-invalid={!!error}
        />
      ) : (
        <Input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(defaultValue ?? "")}
          disabled={disabled}
          aria-invalid={!!error}
        />
      )}
    </FieldWrapper>
  );
});

StringField.displayName = "StringField";

/**
 * Campo especializado para valores de arreglo, con adición y eliminación dinámica de elementos.
 */
const ArrayField = React.memo(({
  propSchema,
  value,
  onChange,
  error,
  disabled,
  label,
  errors,
  path,
}: {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
  disabled: boolean;
  label: string;
  errors: Record<string, string>;
  path: string;
}) => {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = propSchema.items as JsonSchemaNode;
  const isComplex = resolveType(itemSchema) === "object";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {propSchema.description && (
            <p className="text-xs text-muted-foreground">
              {propSchema.description}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled ||
            (propSchema.maxItems !== undefined &&
              items.length >= (propSchema.maxItems as number))
          }
          onClick={() => {
            const newItem = getDefaultForSchema(itemSchema);
            onChange([...items, newItem]);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {isComplex ? "Añadir elemento" : "Añadir"}
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="group relative flex items-start space-x-2 rounded-lg border p-3"
          >
            <div className="flex-1">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Elemento {index + 1}
              </div>
              <FormField
                propSchema={itemSchema}
                value={item}
                label=""
                path={`${path}/${index}`}
                onChange={(newVal) => {
                  const newItems = [...items];
                  newItems[index] = newVal;
                  onChange(newItems);
                }}
                disabled={disabled}
                errors={errors}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={
                disabled ||
                (propSchema.minItems !== undefined &&
                  items.length <= (propSchema.minItems as number))
              }
              onClick={() => {
                const newItems = [...items];
                newItems.splice(index, 1);
                onChange(newItems);
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Quitar elemento</span>
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Aún no se añadieron elementos.
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}
    </div>
  );
});

ArrayField.displayName = "ArrayField";

/**
 * Campo especializado para valores de objeto, con renderizado recursivo de propiedades anidadas.
 */
const ObjectField = React.memo(({
  propSchema,
  value,
  onChange,
  disabled,
  label,
  errors,
  path,
}: {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled: boolean;
  label: string;
  errors: Record<string, string>;
  path: string;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const handleObjectChange = (newVal: Record<string, unknown>) => {
    onChange(newVal);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="text-left">
          <Label className="cursor-pointer text-sm font-semibold">
            {label}
          </Label>
          {propSchema.description && (
            <p className="text-xs text-muted-foreground">
              {propSchema.description}
            </p>
          )}
        </div>
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {!isCollapsed && (
        <div className="pt-2">
          <JsonSchemaForm
            schema={propSchema}
            values={(value as Record<string, unknown>) ?? {}}
            onChange={handleObjectChange}
            disabled={disabled}
            errors={Object.fromEntries(
              Object.entries(errors)
                .filter(([errPath]) => errPath.startsWith(`${path}/`))
                .map(([errPath, err]) => [errPath.replace(path, ""), err]),
            )}
          />
        </div>
      )}
    </div>
  );
});

ObjectField.displayName = "ObjectField";

/**
 * Componente orquestador que selecciona y renderiza el tipo de campo apropiado según el nodo de schema.
 */
const FormField = React.memo(({
  propSchema,
  value,
  onChange,
  error,
  disabled,
  label,
  isRequired,
  errors,
  path,
}: FormFieldProps) => {
  const type = resolveType(propSchema);
  const isReadOnly = disabled || propSchema.readOnly === true;

  switch (type) {
    case "boolean":
      return (
        <BooleanField
          id={path}
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
        />
      );

    case "enum":
      return (
        <EnumField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          options={propSchema.enum ?? []}
        />
      );

    case "secret-ref":
      return (
        <SecretField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
        />
      );

    case "number":
    case "integer":
      return (
        <NumberField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
          type={type as "number" | "integer"}
        />
      );

    case "array":
      return (
        <ArrayField
          propSchema={propSchema}
          value={value}
          onChange={onChange}
          error={error}
          disabled={isReadOnly}
          label={label}
          errors={errors}
          path={path}
        />
      );

    case "object":
      return (
        <ObjectField
          propSchema={propSchema}
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          errors={errors}
          path={path}
        />
      );

    default: // cadena
      return (
        <StringField
          value={value}
          onChange={onChange}
          disabled={isReadOnly}
          label={label}
          isRequired={isRequired}
          description={propSchema.description}
          error={error}
          defaultValue={propSchema.default}
          format={propSchema.format}
          maxLength={propSchema.maxLength}
        />
      );
  }
});

FormField.displayName = "FormField";

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * Componente principal JsonSchemaForm.
 * Renderiza un formulario basado en un subconjunto de la especificación JSON Schema.
 * Soporta tipos primitivos, enums, secretos, objetos y arreglos con recursión.
 */
export function JsonSchemaForm({
  schema,
  values,
  onChange,
  errors = {},
  disabled,
  className,
}: JsonSchemaFormProps) {
  const type = resolveType(schema);

  const handleRootScalarChange = useCallback((newVal: unknown) => {
    // Si la raíz es un escalar, values ES el valor
    onChange(newVal as Record<string, unknown>);
  }, [onChange]);

  // Si es un escalar en la raíz, renderizar un solo FormField
  if (type !== "object") {
    return (
      <div className={className}>
        <FormField
          propSchema={schema}
          value={values}
          label=""
          path=""
          onChange={handleRootScalarChange}
          disabled={disabled}
          errors={errors}
        />
      </div>
    );
  }

  // Memoizar para evitar re-renders cuando el padre provee nuevas referencias de objeto
  const properties = useMemo(() => schema.properties ?? {}, [schema.properties]);
  const requiredFields = useMemo(
    () => new Set(schema.required ?? []),
    [schema.required],
  );

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [onChange, values],
  );

  if (Object.keys(properties).length === 0) {
    return (
      <div
        className={cn(
          "py-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No hay opciones de configuración disponibles.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {Object.entries(properties).map(([key, propSchema]) => {
        const value = values[key];
        const isRequired = requiredFields.has(key);
        const error = errors[`/${key}`];
        const label = labelFromKey(key, propSchema);
        const path = `/${key}`;

        return (
          <FormField
            key={key}
            propSchema={propSchema}
            value={value}
            onChange={(val) => handleFieldChange(key, val)}
            error={error}
            disabled={disabled}
            label={label}
            isRequired={isRequired}
            errors={errors}
            path={path}
          />
        );
      })}
    </div>
  );
}
