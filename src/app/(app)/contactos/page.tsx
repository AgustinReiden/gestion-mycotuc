import { ContactsShell } from "@/components/app/contacts-shell";
import { getContactsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await getContactsData();

  return <ContactsShell contacts={contacts} />;
}
