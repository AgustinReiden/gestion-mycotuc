"use client";

import { useDeferredValue, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import { ContactForm } from "@/components/forms/contact-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ContactRecord } from "@/lib/domain";
import { useQuickCreate } from "@/lib/hooks/use-quick-create";
import { cn } from "@/lib/utils";

type ContactsShellProps = {
  contacts: ContactRecord[];
};

function sortContacts(list: ContactRecord[]) {
  return [...list].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}

function upsertContact(list: ContactRecord[], contact: ContactRecord) {
  return sortContacts([contact, ...list.filter((entry) => entry.id !== contact.id)]);
}

function NewContactModal({ onContactSaved }: { onContactSaved: (contact: ContactRecord) => void }) {
  const [open, setOpen] = useQuickCreate("contacto");

  return (
    <>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-5 w-5" />
        Nuevo contacto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo contacto" description="Los contactos pueden reutilizarse en ventas o compras.">
        <ContactForm contact={null} onSuccess={(contact) => { setOpen(false); onContactSaved(contact); }} />
      </Modal>
    </>
  );
}

function EditContactModal({
  contact,
  onClose,
  onContactSaved,
}: {
  contact: ContactRecord;
  onClose: () => void;
  onContactSaved: (contact: ContactRecord) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Editar contacto" description="Los contactos pueden reutilizarse en ventas o compras.">
      <ContactForm contact={contact} onSuccess={(updatedContact) => { onContactSaved(updatedContact); onClose(); }} />
    </Modal>
  );
}

export function ContactsShell({ contacts }: ContactsShellProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactRecord["type"]>("all");
  const [contactRecords, setContactRecords] = useState(() => sortContacts(contacts));
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const deferredSearch = useDeferredValue(search);
  const hasActiveFilters = deferredSearch.trim().length > 0 || typeFilter !== "all";

  // Cuando el servidor manda datos nuevos (router.refresh), reemplazan a los locales.
  const [syncedContacts, setSyncedContacts] = useState(contacts);
  if (syncedContacts !== contacts) {
    setSyncedContacts(contacts);
    setContactRecords(sortContacts(contacts));
  }

  const filteredContacts = contactRecords.filter((contact) => {
    const query = deferredSearch.toLowerCase();
    const matchesSearch =
      contact.name.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" ? true : contact.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeFilters: { value: typeof typeFilter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "client", label: "Clientes" },
    { value: "supplier", label: "Proveedores" },
  ];

  return (
    <div className="page-grid">
      <div className="grid gap-3">
        <NewContactModal
          onContactSaved={(contact) => {
            setContactRecords((current) => upsertContact(current, contact));
          }}
        />
        <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 focus-within:border-[var(--foreground)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nombre, teléfono o email"
            aria-label="Buscar contactos"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-[#958d84]"
          />
        </label>
        <div className="chip-row" role="radiogroup" aria-label="Filtrar contactos por tipo">
          {typeFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={typeFilter === filter.value}
              onClick={() => setTypeFilter(filter.value)}
              className={cn(
                "min-h-10 rounded-full border px-3.5 text-sm font-semibold",
                typeFilter === filter.value
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                  : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)]",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <Panel>
          <EmptyState
            title={hasActiveFilters ? "No encontramos contactos" : "Todavía no hay contactos"}
            description={
              hasActiveFilters
                ? "Probá con otro filtro o creá un contacto nuevo."
                : "Creá la agenda inicial para reutilizar clientes y proveedores en toda la app."
            }
            icon={ClipboardList}
          />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Panel key={contact.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{contact.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{contact.email ?? "Sin email"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge tone={contact.type === "client" ? "accent" : "warning"}>
                    {contact.type === "client" ? "Cliente" : "Proveedor"}
                  </Badge>
                  {!contact.isActive ? <Badge>Inactivo</Badge> : null}
                </div>
              </div>

              <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] p-3.5 text-sm text-[var(--muted)]">
                <p>Teléfono: {contact.phone ?? "-"}</p>
                <p className="mt-1.5">Notas: {contact.notes ?? "-"}</p>
              </div>

              <div className="mt-auto flex">
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setSelectedContact(contact)}>
                  Editar contacto
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {selectedContact ? (
        <EditContactModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onContactSaved={(contact) => {
            setContactRecords((current) => upsertContact(current, contact));
          }}
        />
      ) : null}
    </div>
  );
}
