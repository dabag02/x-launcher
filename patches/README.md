# Patches — X-Launcher

Sistema di patch incrementali con backup e ripristino automatico.

---

## Applicare una patch

```bash
bash patches/patch-step2-001.sh
```

La patch:
1. Salva un backup dei file che modificherà in `patches/.backups/step2-001/`
2. Applica le modifiche ai sorgenti
3. Ricompila automaticamente

---

## Ripristinare una patch

```bash
bash patches/patch-step2-001.sh --restore
```

Il restore:
1. Copia i file dal backup ai percorsi originali
2. Ricompila automaticamente

---

## Applicare più patch in sequenza

```bash
bash patches/patch-step2-001.sh
bash patches/patch-step2-002.sh
bash patches/patch-step2-003.sh
```

Ogni patch fa il backup dello stato **al momento in cui viene applicata**,
quindi il restore di ciascuna riporta allo stato precedente a quella patch.

---

## Nomenclatura

```
patch-step2-001.sh   ← prima patch dello step 2
patch-step2-002.sh   ← seconda patch dello step 2
patch-step3-001.sh   ← prima patch dello step 3
```

## Struttura backup

```
patches/
  .backups/
    step2-001/
      src/App.tsx
      server.ts
    step2-002/
      src/components/FocusProvider.tsx
      ...
```
