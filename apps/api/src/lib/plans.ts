// Planos comerciais e limites de vagas por clínica.
// Essencial atende o psicólogo autônomo; Pro, clínicas pequenas.
export const PLAN_LIMITS = {
  essencial: { psychologist: 1, secretary: 1 },
  pro: { psychologist: 3, secretary: 3 },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;
export const PLAN_KEYS = Object.keys(PLAN_LIMITS) as PlanKey[];
export const DEFAULT_PLAN: PlanKey = 'essencial';

// Clínicas criadas antes da simplificação ainda podem ter 'plus' gravado.
// Normaliza para um plano existente para não devolver limites indefinidos.
export function normalizePlan(raw: string | null | undefined): PlanKey {
  return raw && raw in PLAN_LIMITS ? (raw as PlanKey) : DEFAULT_PLAN;
}

export function planLimits(raw: string | null | undefined) {
  return PLAN_LIMITS[normalizePlan(raw)];
}

// Gera um código de empresa curto e legível (ex.: "VTX-9F3A2C1D").
export function generateCompanyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `VTX-${hex}`;
}

// Valida CPF (11 dígitos) pelos dígitos verificadores.
export function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

// Valida CNPJ (14 dígitos) pelos dígitos verificadores.
export function isValidCNPJ(raw: string): boolean {
  const cnpj = raw.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i];
    const d = sum % 11;
    return d < 2 ? 0 : 11 - d;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function isValidTaxId(type: 'cnpj' | 'cpf', raw: string): boolean {
  return type === 'cpf' ? isValidCPF(raw) : isValidCNPJ(raw);
}
