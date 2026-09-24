import type { AssetImage } from "@paperclipai/shared";
import { api } from "./client";

export const assetsApi = {
  uploadImage: async (companyId: string, file: File, namespace?: string) => {
    // Lee los datos del archivo en memoria de inmediato para que el cuerpo del fetch sea autocontenido.
    // Los objetos File pegados desde el portapapeles referencian datos transitorios que el navegador
    // puede descartar después de que el manejador del evento de pegado termina, lo que causa ERR_ACCESS_DENIED
    // cuando fetch() intenta luego transmitir el cuerpo del FormData.
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });

    const form = new FormData();
    if (namespace && namespace.trim().length > 0) {
      form.append("namespace", namespace.trim());
    }
    form.append("file", safeFile);
    return api.postForm<AssetImage>(`/companies/${companyId}/assets/images`, form);
  },

  uploadCompanyLogo: async (companyId: string, file: File) => {
    const buffer = await file.arrayBuffer();
    const safeFile = new File([buffer], file.name, { type: file.type });

    const form = new FormData();
    form.append("file", safeFile);
    return api.postForm<AssetImage>(`/companies/${companyId}/logo`, form);
  },
};
