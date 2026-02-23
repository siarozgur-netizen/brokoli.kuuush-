"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Person } from "@/types/domain";

type Props = {
  initialPeople: Person[];
};

export function PeopleClient({ initialPeople }: Props) {
  const router = useRouter();
  const [people] = useState(initialPeople);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = () => router.refresh();

  const addPerson = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName })
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Kisi eklenemedi");
      return;
    }

    setNewName("");
    reload();
  };

  const updatePerson = async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/people/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Guncelleme hatasi");
    else reload();
  };

  const deletePerson = async (id: string) => {
    const confirmed = window.confirm(
      "Bu kisiyi silmek istiyor musunuz?\n\nBu islemle kisinin borc/alacak hesaplari, odeme kayitlari ve ilgili satin alim dagilimlari da temizlenir."
    );
    if (!confirmed) return;
    setDeletingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/people/${id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Silme hatasi");
        return;
      }
      reload();
    } catch {
      setError("Silme istegi gonderilemedi. Internet baglantinizi kontrol edin.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Yeni Kisi</h2>
        <form className="row" onSubmit={addPerson}>
          <input
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Kisi adi"
            required
          />
          <button className="button" type="submit" style={{ width: "auto" }}>
            Ekle
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Kisiler</h2>
        <div className="grid">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              onRename={(name) => updatePerson(person.id, { name })}
              onToggleActive={() => updatePerson(person.id, { is_active: !person.is_active })}
              onDelete={() => deletePerson(person.id)}
              deleting={deletingId === person.id}
            />
          ))}
          {!people.length && <p className="muted">Henuz kisi yok.</p>}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PersonRow({
  person,
  onRename,
  onToggleActive,
  onDelete,
  deleting
}: {
  person: Person;
  onRename: (name: string) => void;
  onToggleActive: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [name, setName] = useState(person.name);

  return (
    <div className="row" style={{ justifyContent: "space-between", border: "1px solid var(--border)", padding: 12, borderRadius: 10 }}>
      <div className="row" style={{ flex: 1 }}>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        <span className="badge">{person.is_active ? "Aktif" : "Pasif"}</span>
      </div>
      <div className="row" style={{ width: "auto" }}>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => onRename(name)}>
          Kaydet
        </button>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onToggleActive}>
          {person.is_active ? "Pasif Yap" : "Aktif Yap"}
        </button>
        <button type="button" className="button danger" style={{ width: "auto" }} onClick={onDelete}>
          {deleting ? "Siliniyor..." : "Sil"}
        </button>
      </div>
    </div>
  );
}
