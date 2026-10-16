/* La Quête du Cap Homard : logique du jeu (sans serveur, tout se passe dans le téléphone). */
(function () {
  'use strict';
  const ETAPES = window.ETAPES || [];
  const CLE = 'quete-cap-homard-v1';
  const $ = (id) => document.getElementById(id);

  // ---------- État sauvegardé (survit à un rechargement de la page) ----------
  let etat = charger();
  function charger() {
    try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; }
  }
  function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* mode privé : on continue sans sauvegarde */ }
  }
  if (new URLSearchParams(location.search).has('reset')) {
    etat = {}; sauver(); history.replaceState(null, '', location.pathname);
  }

  // ---------- Normalisation des réponses : majuscules, accents, espaces, apostrophes ignorés ----------
  function normaliser(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  async function empreinte(s) {
    const data = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Chrono ----------
  function formatDuree(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  setInterval(() => {
    if (!etat.debut) return;
    const fin = etat.fin || Date.now();
    $('chrono').textContent = formatDuree(fin - etat.debut);
  }, 1000);

  // ---------- Affichage ----------
  const ecrans = ['ecran-accueil', 'ecran-etape', 'ecran-succes', 'ecran-final'];
  function montrer(id) {
    ecrans.forEach((e) => { $(e).hidden = (e !== id); });
    window.scrollTo(0, 0);
  }
  function majProgression() {
    const n = etat.etape || 0;
    $('progression').hidden = !etat.debut;
    $('chrono').hidden = !etat.debut;
    $('barre-remplie').style.width = `${Math.round((n / ETAPES.length) * 100)}%`;
    $('progression-texte').textContent = etat.fin ? 'Terminé' : `Étape ${Math.min(n + 1, ETAPES.length)} / ${ETAPES.length}`;
  }

  function rendre() {
    majProgression();
    if (!etat.debut) { montrer('ecran-accueil'); return; }
    if (etat.fin) { rendreFinal(); return; }
    if (etat.transition) { rendreSucces(); return; }
    rendreEtape();
  }

  function rendreEtape() {
    const e = ETAPES[etat.etape || 0];
    if (!e) { etat.fin = Date.now(); sauver(); rendreFinal(); return; }
    $('etape-numero').textContent = `Étape ${e.id}`;
    $('etape-lieu').textContent = e.lieu || '';
    $('etape-titre').textContent = e.titre;
    $('etape-texte').textContent = e.texte;
    const fig = $('etape-figure');
    if (e.image) {
      fig.hidden = false;
      $('etape-image').src = e.image;
      $('etape-image').alt = e.legende || e.titre;
      $('etape-legende').textContent = e.legende || '';
    } else { fig.hidden = true; }
    $('etape-question').textContent = e.question;
    $('reponse').placeholder = e.placeholder || '';
    $('reponse').value = '';
    $('retour').textContent = ''; $('retour').className = 'retour';
    const erreurs = (etat.erreurs && etat.erreurs[e.id]) || 0;
    $('btn-indice').hidden = !(e.indice && erreurs >= 3);
    $('indice').hidden = true; $('indice').textContent = e.indice || '';
    montrer('ecran-etape');
    setTimeout(() => $('reponse').focus(), 350);
  }

  function rendreSucces() {
    const e = ETAPES[(etat.etape || 1) - 1];
    $('succes-texte').textContent = e ? e.succes : '';
    $('btn-suite').textContent = (etat.etape >= ETAPES.length) ? 'Voir le trésor' : 'Étape suivante';
    montrer('ecran-succes');
  }

  function rendreFinal() {
    $('final-equipe').textContent = etat.equipe || '';
    $('final-temps').textContent = formatDuree((etat.fin || Date.now()) - etat.debut);
    montrer('ecran-final');
  }

  // ---------- Événements ----------
  $('form-equipe').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nom = $('nom-equipe').value.trim();
    if (!nom) return;
    etat = { equipe: nom, debut: Date.now(), etape: 0, erreurs: {} };
    sauver(); rendre();
  });

  let verrou = false;
  $('form-reponse').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (verrou) return;
    const e = ETAPES[etat.etape || 0];
    const saisie = normaliser($('reponse').value);
    if (!saisie) return;
    verrou = true;
    let ok = false;
    try {
      const h = await empreinte(saisie);
      ok = e.empreintes.includes(h);
    } catch (err) {
      $('retour').textContent = 'Vérification impossible sur cet appareil. Ouvrez la page en https.';
      $('retour').className = 'retour erreur'; verrou = false; return;
    }
    const retour = $('retour');
    if (ok) {
      retour.textContent = 'Mot de passe correct !'; retour.className = 'retour ok';
      etat.etape = (etat.etape || 0) + 1;
      etat.transition = true;
      if (etat.etape >= ETAPES.length) etat.fin = Date.now();
      sauver();
      setTimeout(rendre, 600);
    } else {
      etat.erreurs = etat.erreurs || {};
      etat.erreurs[e.id] = (etat.erreurs[e.id] || 0) + 1;
      sauver();
      const n = etat.erreurs[e.id];
      retour.textContent = n >= 3 ? 'Toujours pas. Un indice est disponible ci-dessous.' : 'Ce n\'est pas le bon mot de passe. Cherchez encore !';
      retour.className = 'retour erreur';
      const champ = $('reponse');
      champ.classList.remove('secoue'); void champ.offsetWidth; champ.classList.add('secoue');
      champ.select();
      if (e.indice && n >= 3) $('btn-indice').hidden = false;
    }
    verrou = false;
  });

  $('btn-indice').addEventListener('click', () => {
    $('indice').hidden = false;
    $('btn-indice').hidden = true;
  });

  $('btn-suite').addEventListener('click', () => {
    etat.transition = false; sauver(); rendre();
  });

  // Visionneuse plein écran pour la carte
  $('etape-image').addEventListener('click', () => {
    $('visionneuse-image').src = $('etape-image').src;
    $('visionneuse').hidden = false;
  });
  $('visionneuse-fermer').addEventListener('click', () => { $('visionneuse').hidden = true; });
  $('visionneuse').addEventListener('click', (ev) => { if (ev.target === $('visionneuse')) $('visionneuse').hidden = true; });

  // Mode hors ligne : la page et ses images restent disponibles après un premier chargement
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  rendre();
})();
