// Traduz erros do Supabase/Postgres para mensagens claras em Português.
// NUNCA mostrar a mensagem crua do Postgres ao utilizador — usar sempre isto.

type ErroBD = { code?: string; message?: string; details?: string } | null | undefined

export function mensagemErro(error: ErroBD, opts?: { entidade?: string }): string {
  const ent = opts?.entidade ?? 'registo'
  if (!error) return 'Ocorreu um erro inesperado. Tenta novamente.'
  const code = error.code ?? ''
  const msg = `${error.message ?? ''} ${error.details ?? ''}`

  // 23505 = unique_violation
  if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
    if (/serial/i.test(msg)) return 'Já existe um equipamento com este número de série.'
    if (/nif/i.test(msg)) return `Já existe um ${ent} com este NIF.`
    if (/email/i.test(msg)) return `Já existe um ${ent} com este email.`
    if (/nome/i.test(msg)) return `Já existe um ${ent} com este nome.`
    return `Já existe um ${ent} com estes dados.`
  }
  if (code === '23503') return 'Operação bloqueada: há dados ligados a este registo.' // foreign_key_violation
  if (code === '23502') return 'Faltam campos obrigatórios.' // not_null_violation
  if (code === '23514') return 'Há um valor inválido no formulário.' // check_violation
  if (/permission|row-level|rls|not authorized|401|403/i.test(msg)) return 'Sem permissão para esta operação.'

  return 'Não foi possível concluir a operação. Tenta novamente.'
}
