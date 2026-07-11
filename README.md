# Action Texniki Project

Ενιαία cloud εφαρμογή διαχείρισης τεχνικών εργασιών.

## Περιλαμβάνει
- Login και αλλαγή κωδικού
- Dashboard και φίλτρα
- Πολλαπλούς τεχνικούς ανά εργασία
- Ημερολόγιο μήνα
- Κλήση πελάτη και Google Maps πλοήγηση
- GPS άφιξης / αναχώρησης
- Φωτογραφίες και αρχεία
- Activity log
- PDF αναφορά με ελληνικά (μετατροπή της αναφοράς σε εικόνα)
- Ρόλους admin / τεχνικού
- Supabase cloud συγχρονισμό

## Σειρά εγκατάστασης

### 1. Supabase
Εκτέλεσε ολόκληρο το:
`supabase/action-texniki-upgrade.sql`

### 2. GitHub
Δημιούργησε repository:
`action-texniki-project`

Ανέβασε όλα τα αρχεία και τους φακέλους του ZIP στη ρίζα.

### 3. Vercel
- New Project
- Import `action-texniki-project`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Deploy

### 4. URL επαναφοράς κωδικού
Στο Supabase Authentication → URL Configuration πρόσθεσε το νέο Vercel URL.

## Ασφάλεια
Το project περιέχει μόνο Supabase publishable key. Δεν περιέχει secret/service-role key.
