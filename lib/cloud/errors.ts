/** Supabase's messages, in French. */
export function frenchError(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Adresse pas encore confirmée : ouvrez le lien reçu par e-mail.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (/password should be at least|weak password/i.test(m)) return "Mot de passe trop court ou trop simple : 8 caractères au moins, avec des lettres et des chiffres.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives : réessayez dans quelques minutes.";
  if (/same password|different from the old/i.test(m)) return "Choisissez un mot de passe différent de l’ancien.";
  if (/failed to fetch|network/i.test(m)) return "Le serveur ne répond pas : vérifiez la connexion Internet.";
  return m;
}

