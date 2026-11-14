/** Supabase's messages, in French. */
export function frenchError(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Adresse pas encore confirmée : ouvrez le lien reçu par e-mail.";
  if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (/password should be at least|weak password/i.test(m)) return "Mot de passe trop court ou trop simple : 8 caractères au moins, avec des lettres et des chiffres.";
  // Supabase refuses an address that cannot exist (a Gmail address needs 6 characters before @, a
  // domain must receive mail), and, with its own test mail service, any address outside the project's team.
  if (/email address .* is invalid|email_address_invalid/i.test(m))
    return "Cette adresse e-mail est refusée : elle ne peut pas recevoir de courrier. Vérifiez-la (une adresse Gmail compte au moins 6 caractères avant @), ou utilisez une autre adresse.";
  if (/not authorized|email_address_not_authorized/i.test(m))
    return "Les e-mails de confirmation ne peuvent pas encore être envoyés à cette adresse : ABC Consulting doit terminer la configuration de l’envoi des e-mails.";
  // The project's e-mails per hour (Supabase's own mail service allows very few): an hour, not minutes.
  if (/email rate limit|over_email_send_rate_limit/i.test(m))
    return "Trop d’e-mails envoyés pour l’instant par ABClassement : réessayez dans une heure. Si cela se reproduit, prévenez ABC Consulting.";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives : réessayez dans quelques minutes.";
  if (/same password|different from the old/i.test(m)) return "Choisissez un mot de passe différent de l’ancien.";
  if (/failed to fetch|network/i.test(m)) return "Le serveur ne répond pas : vérifiez la connexion Internet.";
  return m;
}

