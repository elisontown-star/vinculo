// Rótulos legíveis dos papéis. O "owner" é um psicólogo (o responsável pela
// clínica), então nunca mostramos "owner" cru na interface.
export function roleLabel(t: (k: string) => string, role: string): string {
  switch (role) {
    case 'owner':
      return t('team.roleOwner');
    case 'psychologist':
      return t('team.rolePsychologist');
    case 'secretary':
      return t('team.roleSecretary');
    case 'platform_admin':
      return t('team.roleAdmin');
    default:
      return role;
  }
}
