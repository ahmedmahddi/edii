import type { Metadata } from "next";
import { LegalPage } from "@/app/components/legal";

export const metadata: Metadata = { title: "Conditions générales d’utilisation | ABClassement" };

// Model to complete and have validated by a lawyer before publication: the passages in [brackets]
// are to be filled in by ABC Consulting.
export default function Cgu() {
  return (
    <LegalPage title="Conditions générales d’utilisation">
      <section>
        <h2>1. Objet</h2>
        <p>
          Les présentes conditions régissent l’utilisation d’ABClassement, service en ligne édité par ABC Consulting, qui permet de classer des
          établissements selon la nomenclature des établissements dangereux, insalubres ou incommodes, de tenir un registre des exigences
          réglementaires par établissement, d’en suivre l’évaluation et de suivre la parution des textes au Journal officiel de la République
          tunisienne (JORT). Créer un compte vaut acceptation des présentes conditions.
        </p>
      </section>
      <section>
        <h2>2. Éditeur</h2>
        <p>
          ABC Consulting, [forme juridique] au capital de [montant], immatriculée au registre national des entreprises sous le n° [identifiant],
          matricule fiscal [numéro], dont le siège est situé [adresse]. Contact : [adresse e-mail de contact], [téléphone].
        </p>
      </section>
      <section>
        <h2>3. Comptes et espaces de travail</h2>
        <p>
          L’accès au service suppose un compte personnel, ouvert avec une adresse e-mail et un mot de passe que l’utilisateur garde
          confidentiels. Chaque entreprise cliente dispose d’un espace de travail privé. Le propriétaire et les administrateurs d’un espace en
          invitent les membres et leur attribuent un rôle (propriétaire, administrateur, éditeur, lecteur) ; ils répondent des accès qu’ils
          accordent. Un utilisateur peut appartenir à plusieurs espaces.
        </p>
      </section>
      <section>
        <h2>4. Offres, essai et fin d’une offre</h2>
        <p>
          Un nouvel espace bénéficie d’un essai gratuit dont la durée et les limites (nombre d’établissements et de personnes) sont affichées dans
          l’application. Les offres payantes, leurs limites, leur durée et leur prix sont convenus avec ABC Consulting [conditions tarifaires et
          modalités de paiement]. À la fin d’une offre, l’espace passe en lecture seule : les registres restent consultables et exportables, mais
          ne peuvent plus être modifiés, jusqu’à son renouvellement.
        </p>
      </section>
      <section>
        <h2>5. Nature du service</h2>
        <p>
          ABClassement est un outil d’aide à la décision et au suivi. Les classements, les textes proposés, les résumés, les risques et les plans
          d’action sont des propositions établies à partir des textes publiés et de règles de lecture ; ils ne constituent pas un avis juridique
          et ne remplacent ni les textes officiels, qui seuls font foi, ni l’avis des administrations compétentes (dont l’ANPE). L’utilisateur
          vérifie ces propositions, les adapte à son site, et reste seul responsable des évaluations qu’il enregistre et de la conformité de
          ses établissements.
        </p>
      </section>
      <section>
        <h2>6. Contenus de l’utilisateur</h2>
        <p>
          Les registres, évaluations, commentaires et preuves (photos, documents, liens, notes) enregistrés dans un espace appartiennent à
          l’entreprise cliente. ABC Consulting les héberge pour fournir le service et n’y accède pas, sauf invitation dans l’espace ou demande
          de l’entreprise. L’utilisateur s’engage à ne déposer que des contenus licites, dont il a le droit de disposer.
        </p>
      </section>
      <section>
        <h2>7. Disponibilité et sauvegardes</h2>
        <p>
          ABC Consulting s’efforce d’assurer un accès continu au service, sans garantie d’absence d’interruption, notamment pour maintenance. Les
          données sont sauvegardées par l’hébergeur [fréquence et durée de conservation des sauvegardes]. Chaque registre peut être exporté à
          tout moment (Excel, fichier de sauvegarde, rapport PDF).
        </p>
      </section>
      <section>
        <h2>8. Responsabilité</h2>
        <p>
          La responsabilité d’ABC Consulting ne saurait être engagée pour un dommage résultant d’une mauvaise utilisation du service, d’une
          information erronée fournie par l’utilisateur, d’un texte publié après la dernière lecture du Journal officiel, ou d’une décision prise
          sans vérification du texte officiel. [Plafond de responsabilité à définir.]
        </p>
      </section>
      <section>
        <h2>9. Données personnelles</h2>
        <p>
          Le traitement des données personnelles est décrit dans la <a href="/confidentialite">politique de confidentialité</a>.
        </p>
      </section>
      <section>
        <h2>10. Fin d’utilisation et suppression</h2>
        <p>
          Un utilisateur peut quitter un espace à tout moment. Le propriétaire d’un espace peut le supprimer : ses registres et ses preuves sont
          alors effacés définitivement. ABC Consulting peut suspendre un compte en cas de manquement grave aux présentes conditions, après
          mise en demeure restée sans effet [délai].
        </p>
      </section>
      <section>
        <h2>11. Modification des conditions</h2>
        <p>
          ABC Consulting peut faire évoluer les présentes conditions. Les utilisateurs sont informés de toute modification substantielle avant
          son entrée en vigueur ; la poursuite de l’utilisation du service vaut acceptation.
        </p>
      </section>
      <section>
        <h2>12. Droit applicable</h2>
        <p>Les présentes conditions sont régies par le droit tunisien. Tout litige relève des tribunaux compétents de [ville].</p>
      </section>
    </LegalPage>
  );
}
