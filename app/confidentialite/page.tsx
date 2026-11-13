import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal";

export const metadata: Metadata = { title: "Politique de confidentialité | ABClassement" };

// Model to complete and have validated by a lawyer before publication (loi organique n° 2004-63 du
// 27 juillet 2004): the passages in [brackets] are to be filled in by ABC Consulting.
export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité">
      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          ABC Consulting, [adresse], [identifiant], est responsable des traitements de données à caractère personnel réalisés pour fournir
          ABClassement, conformément à la loi organique n° 2004-63 du 27 juillet 2004 portant sur la protection des données à caractère
          personnel. Contact pour toute question ou demande : [adresse e-mail de contact]. [Référence de la déclaration auprès de l’Instance
          nationale de protection des données personnelles (INPDP).]
        </p>
      </section>
      <section>
        <h2>2. Données traitées</h2>
        <ul>
          <li>Compte : adresse e-mail, nom et prénom, mot de passe (conservé sous forme chiffrée par le service d’authentification), date d’acceptation des conditions.</li>
          <li>Espaces de travail : nom de l’entreprise, membres et leurs rôles, invitations (adresse e-mail de la personne invitée), offre.</li>
          <li>Registres : établissements, évaluations, constats, plans d’action, responsables (noms saisis par les utilisateurs), échéances.</li>
          <li>Preuves : notes, liens, photos et documents déposés par les utilisateurs.</li>
          <li>Signalements sur des textes, et préférence de récapitulatif par e-mail.</li>
          <li>Données techniques : journaux de connexion et adresses IP tenus par les hébergeurs, pour la sécurité du service.</li>
        </ul>
      </section>
      <section>
        <h2>3. Finalités</h2>
        <p>
          Fournir le service (comptes, espaces, registres, rapports), envoyer le récapitulatif hebdomadaire à ceux qui le reçoivent, gérer les
          offres des espaces, traiter les signalements, assurer la sécurité et le bon fonctionnement du service. Les données ne sont ni vendues
          ni utilisées à des fins publicitaires.
        </p>
      </section>
      <section>
        <h2>4. Destinataires</h2>
        <p>
          Les membres d’un espace voient ses registres selon leur rôle. Les administrateurs d’ABC Consulting voient la liste des espaces, leurs
          membres et leur activité, mais pas le contenu des registres, sauf invitation dans l’espace. Sous-traitants techniques : Supabase
          (base de données, authentification, stockage des preuves ; hébergement dans l’Union européenne, région de Francfort), Vercel
          (hébergement de l’application), [Resend ou Brevo] (envoi des e-mails).
        </p>
      </section>
      <section>
        <h2>5. Transferts hors de Tunisie</h2>
        <p>
          Les données sont hébergées hors de Tunisie par les sous-traitants ci-dessus. [Conditions du transfert et, le cas échéant, autorisation
          de l’INPDP.]
        </p>
      </section>
      <section>
        <h2>6. Durées de conservation</h2>
        <p>
          Les données d’un compte sont conservées tant qu’il est actif, puis supprimées [délai] après sa fermeture. Les registres et preuves d’un
          espace sont conservés tant que l’espace existe et effacés à sa suppression. Les sauvegardes de l’hébergeur sont conservées [durée].
        </p>
      </section>
      <section>
        <h2>7. Sécurité</h2>
        <p>
          Échanges chiffrés (HTTPS) ; accès aux données contrôlé dans la base elle-même, espace par espace et selon le rôle de chacun ; fichiers
          de preuve privés, ouverts par des liens temporaires ; mots de passe jamais conservés en clair.
        </p>
      </section>
      <section>
        <h2>8. Vos droits</h2>
        <p>
          Vous disposez d’un droit d’accès, de rectification et d’opposition sur les données qui vous concernent, et pouvez demander leur
          suppression, en écrivant à [adresse e-mail de contact]. Votre nom et votre choix de récapitulatif se modifient directement dans
          Mon compte. Vous pouvez saisir l’Instance nationale de protection des données personnelles (INPDP) d’une réclamation.
        </p>
      </section>
      <section>
        <h2>9. Stockage dans le navigateur</h2>
        <p>
          L’application conserve dans votre navigateur votre session de connexion, l’espace ouvert en dernier, votre choix d’apparence et, en
          mode local, vos registres. Aucun traceur publicitaire ni de mesure d’audience tiers n’est utilisé.
        </p>
      </section>
      <section>
        <h2>10. Mise à jour</h2>
        <p>Cette politique peut évoluer ; la date de sa version est indiquée en tête de page.</p>
      </section>
    </LegalPage>
  );
}
