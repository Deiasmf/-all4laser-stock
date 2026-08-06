import { redirect } from 'next/navigation'

// As leads passaram para a área Comercial. Mantém-se este redirecionamento
// para não partir ligações/bookmarks antigos (/alugueres/leads).
export default function LeadsRedirect() {
  redirect('/comercial/leads')
}
