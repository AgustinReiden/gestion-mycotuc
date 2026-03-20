"use client";

import { useDeferredValue, useState } from "react";
import { ClipboardList, Filter, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { ContactForm } from "@/components/forms/contact-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Panel } from "@/components/ui/panel";
import type { ContactRecord } from "@/lib/domain";

type ContactsShellProps = {
  contacts: ContactRecord[];
};

function NewContactModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo contacto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo contacto" description="Los contactos pueden reutilizarse en ventas o compras.">
        <ContactForm contact={null} onSuccess={() => { setOpen(false); router.refresh(); }} />
      </Modal>
    </>
  );
}

function EditContactModal({ contact, onClose }: { contact: ContactRecord; onClose: () => void }) {
  const router = useRouter();

  return (
    <Modal open onClose={onClose} title="Editar contacto" description="Los contactos pueden reutilizarse en ventas o compras.">
      <ContactForm contact={contact} onSuccess={() => { onClose(); router.refresh(); }} />
    </Modal>
  );
}

export function ContactsShell({ contacts }: ContactsShellProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactRecord["type"]>("all");
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filteredContacts = contacts.filter((contact) => {
    const query = deferredSearch.toLowerCase();
    const matchesSearch =
      contact.name.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" ? true : contact.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="page-grid">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#55755e]">Contactos</p>
            <h2 className="mt-2 text-3xl font-semibold">Clientes y proveedores</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Usa una agenda compartida para ventas, compras y trazabilidad comercial.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:min-w-[240px] sm:flex-1">
              <Search className="h-4 w-4 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar contacto..."
                className="flex-1 bg-transparent text-sm placeholder:text-[#7e867e]"
              />
            </label>
            <div className="flex w-full items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 sm:w-auto">
              <Filter className="h-4 w-4 text-[var(--muted)]" />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                className="min-w-0 flex-1 bg-transparent text-sm sm:min-w-[160px]"
              >
                <option value="all">Todos</option>
                <option value="client">Clientes</option>
                <option value="supplier">Proveedores</option>
              </select>
            </div>
            <NewContactModal />
          </div>
        </div>
      </Panel>

      {filteredContacts.length === 0 ? (
        <Panel>
          <EmptyState
            title="No encontramos contactos"
            description="Crea la agenda inicial para reutilizar clientes y proveedores en toda la app."
            icon={ClipboardList}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredContacts.map((contact) => (
            <Panel key={contact.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold">{contact.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{contact.email ?? "Sin email"}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={contact.type === "client" ? "accent" : "warning"}>
                    {contact.type === "client" ? "Cliente" : "Proveedor"}
                  </Badge>
                  {!contact.isActive ? <Badge>Inactivo</Badge> : null}
                </div>
              </div>

              <div className="rounded-[24px] border border-[var(--line)] bg-[#f7f5ef] p-4 text-sm text-[var(--muted)]">
                <p>Telefono: {contact.phone ?? "-"}</p>
                <p className="mt-2">Notas: {contact.notes ?? "-"}</p>
              </div>

              <div className="mt-auto flex justify-end">
                <Button type="button" variant="secondary" onClick={() => setSelectedContact(contact)}>
                  Editar contacto
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {selectedContact ? <EditContactModal contact={selectedContact} onClose={() => setSelectedContact(null)} /> : null}
    </div>
  );
}
