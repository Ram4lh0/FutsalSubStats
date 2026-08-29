export function localLicenseActive(perfil, at = Date.now()) {
  if (!perfil || !['trial', 'active', 'grace'].includes(perfil.licenseStatus)) return false;
  return perfil.licenseExpiresAt == null || perfil.licenseExpiresAt > at;
}

export function localClubLicenseActive(perfil, at = Date.now()) {
  return perfil?.licenca === 'clube' && localLicenseActive(perfil, at);
}
