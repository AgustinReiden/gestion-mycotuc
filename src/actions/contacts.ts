"use server";

import { CACHE_TAGS } from "@/lib/cache";
import type { ActionResponse, ContactRecord } from "@/lib/domain";
import { contactFormSchema } from "@/lib/validators";
import { getContactRecord } from "./records";
import { failure, getAuthenticatedClient, getReturnedId, refreshTags, revalidatePaths, success } from "./shared";

export async function saveContactAction(input: unknown): Promise<ActionResponse<ContactRecord>> {
  const parsed = contactFormSchema.safeParse(input);

  if (!parsed.success) {
    return failure("No pudimos guardar el contacto.", parsed.error);
  }

  try {
    const { supabase } = await getAuthenticatedClient();
    const { id, ...data } = parsed.data;

    const { data: savedContact, error } = await supabase.rpc("upsert_contact", {
      payload: {
        id,
        type: data.type,
        name: data.name,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        isActive: data.isActive,
      },
    });

    if (error) throw error;

    const contactId = getReturnedId(savedContact);

    if (!contactId) {
      throw new Error("No pudimos recuperar el contacto guardado.");
    }

    const contact = await getContactRecord(supabase, contactId);

    if (!contact) {
      throw new Error("No pudimos recuperar el contacto actualizado.");
    }

    refreshTags(CACHE_TAGS.contacts);
    revalidatePaths("/contactos", "/ventas", "/insumos");
    return success("Contacto guardado.", contact);
  } catch (error) {
    return failure("No pudimos guardar el contacto.", error);
  }
}
