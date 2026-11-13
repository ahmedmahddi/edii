"use client";
/** The sheet of one text: evaluate it, keep its evidence, write its action plan, read its history. */
import { FileText, Link2, StickyNote, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { today } from "@/app/components/download";
import { Signaler } from "@/app/components/signaler";
import { Badge, Button, Notice, Segmented, SelectField, Sheet, SheetSection, TextArea, TextField } from "@/app/ui";
import { preuveUrl } from "@/lib/cloud/api";
import { dateFr, refOf } from "@/lib/registre/labels";
import { remplacePar } from "@/lib/registre/referentiel";
import {
  CONFORMITES,
  type Conformite,
  ETATS,
  evaluer,
  FREQUENCES,
  type Ligne,
  type Preuve,
  preuveFichier,
  preuveLien,
  preuvesDe,
  preuveTexte,
  prochaine,
} from "@/lib/registre/registre";
import { defaults, type FicheData, TYPES } from "@/lib/veille/fiche";
import type { Amendment } from "@/lib/veille/watch";
import { ConformiteBadge } from "./badges";
import s from "./LigneSheet.module.css";

const PreuveIcon = ({ p }: { p: Preuve }) => (p.path ? <FileText size={15} /> : p.texte ? <StickyNote size={15} /> : <Link2 size={15} />);

function Details({ title, open, children }: { title: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className={s.details} open={open || undefined}>
      <summary>{title}</summary>
      <div className={s.detailsBody}>{children}</div>
    </details>
  );
}

export function LigneSheet({
  l,
  fiche,
  raisons,
  history,
  repealed,
  set,
  replace,
  onClose,
  who,
  editable,
  upload,
}: {
  l: Ligne;
  fiche?: FicheData;
  raisons?: string[];
  history: Amendment[];
  repealed?: Amendment;
  set: (patch: Partial<Ligne>) => void;
  replace: (fn: (l: Ligne) => Ligne) => void;
  onClose: () => void;
  who: string;
  editable: boolean;
  upload: ((file: File) => Promise<string>) | null;
}) {
  const proposed = defaults(l.texte.domaine, fiche);
  const next = prochaine(l);
  const [conf, setConf] = useState<Conformite>("");
  const [date, setDate] = useState(today());
  const [comment, setComment] = useState("");
  const [preuves, setPreuves] = useState<Preuve[]>([]);
  const [adding, setAdding] = useState<"lien" | "texte" | null>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  // A non-conformity's risk and action plan, recorded with it (prefilled from the text or its fiche).
  const [risque, setRisque] = useState(l.risque || proposed.risque);
  const [plan, setPlan] = useState(l.plan || proposed.plan);
  const [responsable, setResponsable] = useState(l.responsable);
  const [echeance, setEcheance] = useState(l.echeance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // The fiche comes from the server a moment after the sheet opens: its risk and plan replace the
  // ones proposed from the domain, unless already edited.
  const firstProposed = useRef(proposed);
  useEffect(() => {
    const before = firstProposed.current;
    if (before === proposed || !fiche) return;
    setRisque((r) => (r === before.risque ? l.risque || proposed.risque : r));
    setPlan((p) => (p === before.plan ? l.plan || proposed.plan : p));
    firstProposed.current = proposed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiche]);
  const evidence = preuvesDe(l);
  // The uploaded files are read through links that last an hour, fetched when the sheet opens.
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = [...evidence, ...preuves].map((p) => p.path).filter((p): p is string => !!p && !(p in urls));
    if (!paths.length) return;
    Promise.all(paths.map((p) => preuveUrl(p).then((u) => [p, u] as const).catch(() => [p, ""] as const))).then((pairs) =>
      setUrls((u) => ({ ...u, ...Object.fromEntries(pairs) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l.historique, l.preuves, preuves]);

  const linkOf = (p: Preuve) => p.url ?? (p.path ? urls[p.path] : undefined);
  const addFile = async (file: File | undefined) => {
    if (!file || !upload) return;
    setBusy(true);
    setError("");
    try {
      const path = await upload(file);
      setPreuves((ps) => [...ps, preuveFichier(file.name, path, file.type, who)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const addLink = () => {
    if (!/^https?:\/\//i.test(linkUrl.trim())) return setError("Le lien doit commencer par http:// ou https://");
    setPreuves((ps) => [...ps, preuveLien(linkName, linkUrl, who)]);
    setLinkName("");
    setLinkUrl("");
    setAdding(null);
    setError("");
  };
  const addNote = () => {
    if (!noteText.trim()) return setError("Écrivez le texte de la preuve.");
    setPreuves((ps) => [...ps, preuveTexte(noteName, noteText, who)]);
    setNoteName("");
    setNoteText("");
    setAdding(null);
    setError("");
  };
  const record = () => {
    if (!conf) return;
    const action = conf === "NC" ? { risque, plan, responsable, echeance } : undefined;
    replace((x) => evaluer(x, { conformite: conf, date, commentaire: comment, par: who, preuves, action }));
    setConf("");
    setComment("");
    setPreuves([]);
    setSaved(`Évaluation du ${dateFr(date)} enregistrée.`);
  };
  const evaluating = editable && l.retenu;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      wide
      title={l.texte.titre}
      description={
        <>
          {refOf(l.texte)}
          {l.texte.publie ? ` · ${l.texte.publie}` : ""}
          {l.texte.source ? (
            <>
              {" · "}
              <a href={l.texte.source} target="_blank" rel="noreferrer">
                lire le texte
              </a>
            </>
          ) : null}
        </>
      }
      head={
        <div className={s.status}>
          <Badge>{l.texte.theme}</Badge>
          <ConformiteBadge c={l.conformite} />
          <Badge tone={next.etat === "en-retard" ? "danger" : next.etat === "a-jour" ? "success" : "warning"} outline>
            {ETATS[next.etat]}
            {next.date ? ` · ${dateFr(next.date)}` : ""}
          </Badge>
          {l.conformite === "C" && l.actionFaite ? <Badge tone="success">Action réalisée le {dateFr(l.actionFaite)}</Badge> : null}
          {!l.retenu ? <Badge outline>Non retenu</Badge> : null}
        </div>
      }
      footer={
        evaluating ? (
          <>
            <span className={s.footerNote} role="status">
              {saved}
            </span>
            <Button variant="primary" disabled={!conf || busy} onClick={record}>
              Enregistrer l’évaluation
            </Button>
          </>
        ) : undefined
      }
    >
      {repealed ? (
        <Notice tone="danger" title="Texte abrogé">
          Par{" "}
          <a href={repealed.pdf} target="_blank" rel="noreferrer" dir="auto">
            {repealed.title}
          </a>{" "}
          (JORT n° {repealed.issue}/{repealed.year}, p. {repealed.page}).
        </Notice>
      ) : remplacePar(l.texte) ? (
        <Notice tone="warning" title={`Remplacé par ${remplacePar(l.texte)}`} />
      ) : null}

      {evaluating ? (
        <SheetSection title="Nouvelle évaluation">
          <Segmented<Conformite>
            label="Conformité"
            value={conf || null}
            onChange={setConf}
            block
            options={[
              { value: "C", label: CONFORMITES.C, tone: "success" },
              { value: "NC", label: CONFORMITES.NC, tone: "danger" },
              { value: "NA", label: CONFORMITES.NA },
            ]}
          />
          <div className={s.grid2}>
            <TextField label="Date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            <SelectField label="Fréquence" value={l.frequence} onChange={(e) => set({ frequence: e.target.value })}>
              {Object.keys(FREQUENCES).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </SelectField>
          </div>
          <TextArea
            label={conf === "NA" ? "Justification" : conf === "C" ? "Commentaire (facultatif)" : "Constat"}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={conf === "NA" ? "Pourquoi ce texte ne s’applique pas au site…" : conf === "C" ? "Ce qui a été vérifié…" : "Ce qui a été vérifié, ce qui manque…"}
          />
          <div className={s.section}>
            <span className={s.label}>Preuves</span>
            {preuves.length ? (
              <ul className={s.evidence}>
                {preuves.map((p) => (
                  <li key={p.id}>
                    <PreuveIcon p={p} />
                    <span>
                      {p.nom}
                      {p.texte ? <span className={s.evidenceText}> · {p.texte}</span> : null}
                    </span>
                    <Button variant="ghost" size="sm" icon aria-label={`Retirer ${p.nom}`} onClick={() => setPreuves((ps) => ps.filter((x) => x.id !== p.id))}>
                      <X size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={s.row}>
              {upload ? (
                <>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => void addFile(e.target.files?.[0])} />
                  <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <FileText size={14} /> {busy ? "Envoi…" : "Photo ou PDF"}
                  </Button>
                </>
              ) : null}
              <Button size="sm" aria-pressed={adding === "texte"} onClick={() => setAdding(adding === "texte" ? null : "texte")}>
                <StickyNote size={14} /> Texte
              </Button>
              <Button size="sm" aria-pressed={adding === "lien"} onClick={() => setAdding(adding === "lien" ? null : "lien")}>
                <Link2 size={14} /> Lien
              </Button>
              {!upload ? <span className={s.hint}>Les photos et fichiers demandent un espace de travail (compte).</span> : null}
            </div>
            {adding === "texte" ? (
              <div className={s.box}>
                <TextField label="Intitulé (facultatif)" value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Contrat de maintenance, attestation…" />
                <TextArea
                  label="Preuve"
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Ex. : contrat n° 2026-14 avec Société X, valable jusqu’au 31/12/2026 ; registre signé le 03/11/2026…"
                />
                <div>
                  <Button size="sm" onClick={addNote}>
                    Ajouter le texte
                  </Button>
                </div>
              </div>
            ) : null}
            {adding === "lien" ? (
              <div className={s.box}>
                <div className={s.grid2}>
                  <TextField label="Intitulé" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Rapport de contrôle…" />
                  <TextField label="Adresse" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" inputMode="url" />
                </div>
                <div>
                  <Button size="sm" onClick={addLink}>
                    Ajouter le lien
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          {conf === "NC" ? (
            <div className={s.box} data-testid="plan-nc">
              <span className={s.boxTitle}>Risque et plan d’action</span>
              <TextArea label="Risque" rows={2} value={risque} onChange={(e) => setRisque(e.target.value)} />
              <TextArea label="Action à mener" rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} />
              <div className={s.grid2}>
                <TextField label="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
                <TextField label="Échéance" type="date" value={echeance} min={date} onChange={(e) => setEcheance(e.target.value)} />
              </div>
            </div>
          ) : null}
          {error ? <Notice tone="danger" title={error} /> : null}
        </SheetSection>
      ) : null}

      {l.retenu && l.conformite === "NC" ? (
        <SheetSection title="Plan d’action">
          <TextArea label="Action" rows={3} value={l.plan || proposed.plan} onChange={(e) => set({ plan: e.target.value })} disabled={!editable} />
          <div className={s.grid2}>
            <TextField label="Responsable" value={l.responsable} onChange={(e) => set({ responsable: e.target.value })} disabled={!editable} />
            <TextField label="Échéance" type="date" value={l.echeance} onChange={(e) => set({ echeance: e.target.value })} disabled={!editable} />
          </div>
          <TextArea label="Risque" rows={2} value={l.risque || proposed.risque} onChange={(e) => set({ risque: e.target.value })} disabled={!editable} />
          <p className={s.hint}>L’action est close par une nouvelle évaluation conforme.</p>
        </SheetSection>
      ) : null}

      <div>
        <Details title={l.conformite ? "Exigences" : "Exigences et risque"} open={!l.retenu || l.conformite === ""}>
          {!l.resume ? (
            <p className={s.hint}>
              {fiche?.r ? "Résumé rédigé" : fiche?.o?.length ? "Exigences relevées dans les articles du texte" : "Proposé d’après le domaine du texte"} : à vérifier et à
              adapter au site.
              {fiche?.p ? ` Périodicité relevée : ${fiche.p.toLowerCase()}.` : ""}
              {fiche?.t?.length ? ` Obligations : ${fiche.t.map((t) => TYPES[t]?.label.toLowerCase() ?? t).join(", ")}.` : ""}
            </p>
          ) : null}
          <TextArea label="Résumé des exigences" rows={4} value={l.resume || proposed.resume} onChange={(e) => set({ resume: e.target.value })} disabled={!editable} />
          {fiche?.o?.length ? (
            <div className={s.section}>
              <span className={s.label}>Articles cités par le texte</span>
              <ul className={s.links}>
                {fiche.o.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {l.conformite === "" ? (
            <TextArea label="Risque en cas de non-conformité" rows={2} value={l.risque || proposed.risque} onChange={(e) => set({ risque: e.target.value })} disabled={!editable} />
          ) : null}
        </Details>

        <Details title={`Historique${l.historique?.length ? ` (${l.historique.length})` : ""}`} open={!!l.historique?.length}>
          {l.historique?.length ? (
            <ol className={s.history} aria-label="Évaluations">
              {[...l.historique].reverse().map((e) => (
                <li key={e.id}>
                  <span className={s.historyHead}>
                    <ConformiteBadge c={e.conformite} />
                    {dateFr(e.date)}
                    {e.par ? ` · ${e.par}` : ""}
                  </span>
                  {e.commentaire ? <p className={s.historyText}>{e.commentaire}</p> : null}
                  {e.preuves.length ? (
                    <ul className={s.evidence}>
                      {e.preuves.map((p) => (
                        <li key={p.id}>
                          <PreuveIcon p={p} />
                          {p.texte ? (
                            <span>
                              <strong>{p.nom}</strong> <span className={s.evidenceText}>{p.texte}</span>
                            </span>
                          ) : linkOf(p) ? (
                            <a href={linkOf(p)} target="_blank" rel="noreferrer">
                              {p.nom}
                            </a>
                          ) : (
                            <span>{p.nom}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.small}>Aucune évaluation enregistrée pour l’instant.</p>
          )}
        </Details>

        <Details title="Pourquoi ce texte, et ses modifications">
          <p className={s.small}>
            {l.origine === "ajoute" ? "Ajouté à la main." : `Pourquoi : ${l.raisons.join(", ")}.`}
            {raisons?.length ? ` Importance : ${raisons.slice(0, 4).join(" · ")}.` : ""}
          </p>
          {history.length ? (
            <ul className={s.links}>
              {history.map((a) => (
                <li key={a.id}>
                  <a href={a.pdf} target="_blank" rel="noreferrer" dir="auto">
                    {a.title}
                  </a>{" "}
                  <span className={s.hint}>
                    JORT n° {a.issue}/{a.year}, p. {a.page}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.small}>Aucune modification relevée au JORT.</p>
          )}
          <div className={s.row}>
            {editable ? <Button onClick={() => set({ retenu: !l.retenu })}>{l.retenu ? "Retirer du registre" : "Retenir dans le registre"}</Button> : null}
            <Signaler texteId={l.texte.id} titre={l.texte.titre} />
          </div>
        </Details>
      </div>
    </Sheet>
  );
}
