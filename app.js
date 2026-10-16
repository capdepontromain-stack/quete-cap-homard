/* La Quête du Cap Homard : logique du jeu (sans serveur, tout se passe dans le téléphone). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ETAPES = window.ETAPES || [];
  const CONFIG = window.CONFIG || {};
  // Personnalisation (nom du client, objectif) depuis prive/reponses.json
  if (CONFIG.client) { $('marque').textContent = CONFIG.client; document.title = `La Quête du Cap Homard · ${CONFIG.client}`; }
  if (CONFIG.accroche) $('accroche').textContent = CONFIG.accroche;
  if (CONFIG.intro) $('intro').textContent = CONFIG.intro;
  if (CONFIG.final_titre) $('final-titre').textContent = CONFIG.final_titre;
  if (CONFIG.final_sous_titre) $('final-sous-titre').textContent = CONFIG.final_sous_titre;
  const CLE = 'quete-cap-homard-v1';

  // ---------- État sauvegardé (survit à un rechargement de la page) ----------
  let etat = charger();
  function charger() {
    try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; }
  }
  function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* mode privé : on continue sans sauvegarde */ }
  }
  // Lien du QR code = ?reset=1 : on repart de l'accueil. Une partie en cours (non terminée)
  // est mise de côté et proposée en « Reprendre » sur l'accueil, pour ne pas la perdre.
  const SAUVEGARDE = 'quete-cap-homard-sauvegarde';
  if (new URLSearchParams(location.search).has('reset')) {
    try {
      if (etat.debut && !etat.fin) localStorage.setItem(SAUVEGARDE, JSON.stringify(etat));
      else localStorage.removeItem(SAUVEGARDE);
    } catch (e) {}
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

  // ---------- Relecture des écrans précédents (flèches en bas), sans toucher à la progression ----------
  let vue = null; // null = écran en cours ; sinon index d'une étape déjà validée, en lecture seule
  function cibleRetour() {
    if (!etat.debut) return -1;
    if (vue !== null) return vue - 1;
    if (etat.fin) return ETAPES.length - 1;
    return (etat.etape || 0) - 1; // écran d'étape ou de réussite : l'étape validée juste avant
  }
  function majFleches() {
    $('fleche-retour').hidden = cibleRetour() < 0;
    $('fleche-avant').hidden = (vue === null);
  }
  $('fleche-retour').addEventListener('click', () => {
    const c = cibleRetour(); if (c < 0) return;
    vue = c; rendre();
  });
  $('fleche-avant').addEventListener('click', () => {
    if (vue === null) return;
    vue = (vue + 1 >= (etat.etape || 0)) ? null : vue + 1; rendre();
  });
  $('btn-retour-courant').addEventListener('click', () => { vue = null; rendre(); });

  function rendre() {
    majProgression();
    if (vue !== null && (!etat.debut || vue < 0 || vue >= (etat.etape || 0))) vue = null;
    majFleches();
    if (vue !== null) { rendreEtape(vue, true); return; }
    if (!etat.debut) { rendreAccueil(); return; }
    if (etat.fin) { rendreFinal(); return; }
    if (etat.transition) { rendreSucces(); return; }
    rendreEtape();
  }

  function rendreAccueil() {
    let sauv = null;
    try { sauv = JSON.parse(localStorage.getItem(SAUVEGARDE)); } catch (e) {}
    const btn = $('btn-reprendre');
    if (sauv && sauv.debut && !sauv.fin) {
      btn.hidden = false;
      btn.textContent = `Reprendre la partie de « ${sauv.equipe} » (étape ${(sauv.etape || 0) + 1})`;
      btn.onclick = () => { etat = sauv; sauver(); try { localStorage.removeItem(SAUVEGARDE); } catch (e) {} rendre(); };
    } else { btn.hidden = true; }
    montrer('ecran-accueil');
  }

  function rendreEtape(index, lectureSeule) {
    const i = (typeof index === 'number') ? index : (etat.etape || 0);
    const e = ETAPES[i];
    if (!e) { etat.fin = Date.now(); sauver(); rendreFinal(); return; }
    $('etape-numero').textContent = `Étape ${e.id}`;
    $('etape-lieu').textContent = e.lieu || '';
    $('etape-titre').textContent = e.titre;
    $('etape-texte').textContent = e.texte;
    $('illustration-pirate').hidden = (e.illustration !== 'pirate');
    const prec = ETAPES[i - 1];
    $('rappel').hidden = !prec || !!lectureSeule;
    $('rappel').open = false;
    $('rappel-texte').textContent = prec ? prec.succes : '';
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
    $('btn-indice').hidden = !(e.indice && erreurs >= 3) || !!lectureSeule;
    $('indice').hidden = true; $('indice').textContent = e.indice || '';
    $('form-reponse').hidden = !!lectureSeule;
    $('deja-valide').hidden = !lectureSeule;
    $('deja-valide-texte').textContent = lectureSeule ? (e.succes || '') : '';
    montrer('ecran-etape');
    if (!lectureSeule) setTimeout(() => $('reponse').focus(), 350);
  }

  function rendreSucces() {
    const e = ETAPES[(etat.etape || 1) - 1];
    $('succes-texte').textContent = e ? e.succes : '';
    $('btn-suite').textContent = (etat.etape >= ETAPES.length) ? 'Voir le trésor' : 'Étape suivante';
    montrer('ecran-succes');
  }

  function rendreFinal() {
    $('final-equipe').textContent = etat.equipe || '';
    $('final-chef').textContent = etat.chef || '';
    $('final-chef-bloc').hidden = !etat.chef;
    $('final-temps').textContent = formatDuree((etat.fin || Date.now()) - etat.debut);
    montrer('ecran-final');
  }

  // ---------- Événements ----------
  $('form-equipe').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nom = $('nom-equipe').value.trim();
    const chef = $('nom-chef').value.trim();
    if (!nom || !chef) return;
    etat = { equipe: nom, chef: chef, debut: Date.now(), etape: 0, erreurs: {} };
    try { localStorage.removeItem(SAUVEGARDE); } catch (e) {}
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
    etat.transition = false; vue = null; sauver(); rendre();
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

  // ---------- Accès animateur : appui long (2 s) sur le logo en bas de page, puis code ----------
  const CODE_ANIMATEUR = 'cbcd1dde3d8b0ecc2618fc107743a4c258265f29e6d44287606d0c2a69869b8f'; // empreinte du code
  let appui = null;
  const logo = $('logo-pied');
  const debutAppui = () => { clearTimeout(appui); appui = setTimeout(ouvrirAnimateur, 2000); };
  const finAppui = () => clearTimeout(appui);
  ['touchstart', 'mousedown'].forEach((ev) => logo.addEventListener(ev, debutAppui, { passive: true }));
  ['touchend', 'touchcancel', 'touchmove', 'mouseup', 'mouseleave'].forEach((ev) => logo.addEventListener(ev, finAppui));
  logo.addEventListener('contextmenu', (ev) => ev.preventDefault());
  if (new URLSearchParams(location.search).has('animateur')) ouvrirAnimateur();

  function ouvrirAnimateur() {
    $('animateur').hidden = false;
    $('animateur-menu').hidden = true;
    $('form-animateur').hidden = false;
    $('code-animateur').value = '';
    $('animateur-retour').textContent = '';
    setTimeout(() => $('code-animateur').focus(), 200);
  }
  function menuAnimateur() {
    $('form-animateur').hidden = true;
    $('animateur-menu').hidden = false;
    $('animateur-equipe').textContent = etat.equipe || '(aucune équipe en cours)';
    const cont = $('animateur-etapes');
    cont.innerHTML = '';
    ETAPES.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-or' + (i === (etat.etape || 0) && !etat.fin ? ' actuelle' : '');
      b.textContent = String(e.id); b.title = e.titre;
      b.addEventListener('click', () => {
        if (!etat.debut) etat = { equipe: 'Animateur', debut: Date.now(), etape: 0, erreurs: {} };
        etat.etape = i; etat.transition = false; delete etat.fin; vue = null;
        sauver(); $('animateur').hidden = true; rendre();
      });
      cont.appendChild(b);
    });
  }
  $('form-animateur').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    let ok = false;
    try { ok = (await empreinte(normaliser($('code-animateur').value))) === CODE_ANIMATEUR; } catch (e) { ok = false; }
    if (ok) menuAnimateur();
    else { $('animateur-retour').textContent = 'Code incorrect.'; $('animateur-retour').className = 'retour erreur'; }
  });
  $('animateur-final').addEventListener('click', () => {
    if (!etat.debut) etat = { equipe: 'Animateur', debut: Date.now(), etape: 0, erreurs: {} };
    etat.etape = ETAPES.length; etat.fin = etat.fin || Date.now(); etat.transition = false;
    sauver(); $('animateur').hidden = true; rendre();
  });
  $('animateur-reset').addEventListener('click', () => {
    if (!confirm('Effacer la partie en cours et revenir à l\'accueil ?')) return;
    etat = {}; sauver(); $('animateur').hidden = true; rendre();
  });
  $('animateur-fermer').addEventListener('click', () => { $('animateur').hidden = true; });

  rendre();
})();
