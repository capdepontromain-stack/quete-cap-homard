/* La Quête du Cap Homard : logique du jeu (sans serveur, tout se passe dans le téléphone). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const URL_INITIALE = location.href;
  const PARAMS = new URLSearchParams(location.search);

  // ---------- Mise à jour automatique : si une nouvelle version est publiée, la page se recharge ----------
  (async () => {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      const { v } = await r.json();
      const locale = (document.querySelector('meta[name="version"]') || {}).content;
      const u = new URL(URL_INITIALE);
      if (String(v) !== String(locale) && u.searchParams.get('maj') !== String(v)) {
        u.searchParams.set('maj', v);
        location.replace(u.toString());
      }
    } catch (e) { /* hors ligne : on garde la version en cache */ }
  })();
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
  if (PARAMS.has('reset')) {
    try {
      if (etat.debut && !etat.fin) localStorage.setItem(SAUVEGARDE, JSON.stringify(etat));
      else localStorage.removeItem(SAUVEGARDE);
    } catch (e) {}
    etat = {}; sauver();
  }
  if (location.search) history.replaceState(null, '', location.pathname);

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
  const ecrans = ['ecran-splash', 'ecran-accueil', 'ecran-etape', 'ecran-succes', 'ecran-final'];
  let splashVu = false; // écran de bienvenue vu dans cette ouverture de la page
  function montrer(id) {
    ecrans.forEach((e) => { $(e).hidden = (e !== id); });
    document.body.classList.toggle('splash-actif', id === 'ecran-splash');
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
    if (!etat.debut) { if (!splashVu) { montrer('ecran-splash'); return; } rendreAccueil(); return; }
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
    const ill = $('illustration');
    if (e.illustration) {
      ill.hidden = false;
      ill.classList.toggle('large', e.type === 'photo' || !!e.illustration_grande);
      $('illustration-img').src = e.illustration;
      $('illustration-img').alt = e.illustration_legende || '';
      $('illustration-legende').textContent = e.illustration_legende || '';
    } else { ill.hidden = true; }
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
    const photo = (e.type === 'photo');
    $('form-reponse').hidden = !!lectureSeule || photo;
    $('bloc-photo').hidden = !!lectureSeule || !photo;
    if (photo && !lectureSeule) preparerPhoto(e);
    $('deja-valide').hidden = !lectureSeule;
    $('deja-valide-texte').textContent = lectureSeule ? (e.succes || '') : '';
    $('deja-valide').querySelector('.deja-valide-titre').textContent = photo ? '✓ Défi déjà relevé' : '✓ Étape déjà validée';
    montrer('ecran-etape');
    if (!lectureSeule && !photo) setTimeout(() => $('reponse').focus(), 350);
  }

  // ---------- Défi photo / vidéo : prise de vue, puis partage vers WhatsApp, puis déblocage ----------
  let fichierPhoto = null;
  function preparerPhoto(e) {
    fichierPhoto = null;
    $('bloc-contact').hidden = !e.contact;
    if (e.contact) {
      $('contact-numero').textContent = CONFIG.telephone_affiche || '';
      $('lien-whatsapp-depart').href = `https://wa.me/${CONFIG.whatsapp || ''}?text=${encodeURIComponent(`Ahoy ! L'équipage « ${etat.equipe || '?'} » (chef : ${etat.chef || '?'}) est prêt pour la Quête du Cap Homard.`)}`;
    }
    $('photo-consigne').textContent = e.consigne || '';
    $('photo-fichier').accept = e.media || 'image/*,video/*';
    $('photo-fichier').value = '';
    $('photo-apercu').hidden = true; $('photo-apercu').innerHTML = '';
    $('btn-envoyer').hidden = true;
    $('photo-secours').hidden = true;
    $('photo-retour').textContent = ''; $('photo-retour').className = 'retour';
    $('btn-photo').textContent = (e.media || '').includes('video') ? '📷 Prendre la photo ou la vidéo' : '📷 Prendre la photo';
    // Option « plus tard » : jamais sur le premier défi (celui du contact), formulation qui change, rappel dès le 3e report
    const n = (etat.reportes || []).length;
    const libelles = ['Nous enverrons ce chef-d\'œuvre plus tard', 'On garde ce chef-d\'œuvre pour plus tard, promis', 'J\'enverrai plus tard, c\'est noté'];
    $('bloc-plus-tard').hidden = !!e.contact;
    $('btn-plus-tard').textContent = libelles[Math.min(n, libelles.length - 1)];
    $('plus-tard-avert').hidden = n < 2;
    $('plus-tard-avert').textContent = `Attention : vous avez déjà ${n} chef${n > 1 ? 's' : ''}-d'œuvre en attente. Toutes les photos et vidéos vous seront demandées à la fin de la quête : autant les envoyer tout de suite !`;
  }
  function texteDefi(e) {
    return `Équipage « ${etat.equipe || '?'} » (chef : ${etat.chef || '?'}) · Défi : ${e.titre}`;
  }
  $('btn-photo').addEventListener('click', () => $('photo-fichier').click());
  $('photo-fichier').addEventListener('change', () => {
    const f = $('photo-fichier').files[0];
    if (!f) return;
    fichierPhoto = f;
    const ap = $('photo-apercu'); ap.innerHTML = ''; ap.hidden = false;
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('video/')) { const v = document.createElement('video'); v.src = url; v.controls = true; v.playsInline = true; ap.appendChild(v); }
    else { const im = document.createElement('img'); im.src = url; im.alt = 'Votre photo'; ap.appendChild(im); }
    $('btn-photo').textContent = '📷 Reprendre';
    $('btn-envoyer').hidden = false;
    $('photo-retour').textContent = '';
  });
  $('btn-envoyer').addEventListener('click', async () => {
    const e = ETAPES[etat.etape || 0];
    if (!fichierPhoto) return;
    const donnees = { files: [fichierPhoto], text: texteDefi(e) };
    if (navigator.share && (!navigator.canShare || navigator.canShare(donnees))) {
      try {
        await navigator.share(donnees);
        validerEtape();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') { $('photo-retour').textContent = 'Envoi annulé. Choisissez WhatsApp puis le contact de l\'animateur.'; $('photo-retour').className = 'retour erreur'; return; }
      }
    }
    // Secours (ordinateur ou téléphone sans partage de fichiers) : lien WhatsApp + confirmation manuelle
    const num = CONFIG.whatsapp || '';
    $('lien-whatsapp').href = `https://wa.me/${num}?text=${encodeURIComponent(texteDefi(e) + ' (photo à joindre)')}`;
    $('photo-secours').hidden = false;
    $('photo-retour').textContent = 'Le partage direct n\'est pas disponible ici : ouvrez WhatsApp, envoyez la photo à l\'animateur, puis confirmez.';
    $('photo-retour').className = 'retour erreur';
  });
  $('btn-photo-fait').addEventListener('click', () => { if (fichierPhoto) validerEtape(); });
  $('btn-plus-tard').addEventListener('click', () => {
    const e = ETAPES[etat.etape || 0];
    etat.reportes = etat.reportes || [];
    etat.reportes.push(e.titre);
    validerEtape(true);
  });

  function validerEtape(reporte) {
    etat.dernierReporte = !!reporte;
    etat.etape = (etat.etape || 0) + 1;
    etat.transition = true;
    if (etat.etape >= ETAPES.length) etat.fin = Date.now();
    sauver(); rendre();
  }

  function rendreSucces() {
    const e = ETAPES[(etat.etape || 1) - 1];
    const reporte = !!etat.dernierReporte;
    $('succes-texte').textContent = e ? (reporte ? `Défi reporté : pensez à envoyer votre chef-d'œuvre à l'animateur plus tard. ${e.succes.replace(/^Défi relevé ![^.]*\.\s*/, '').replace(/^Magnifique ![^.]*\.\s*/, '')}` : e.succes) : '';
    $('ecran-succes').querySelector('h2').textContent = reporte ? 'Défi reporté' : ((e && e.type === 'photo') ? 'Défi relevé' : 'Mot de passe validé');
    $('btn-suite').textContent = (etat.etape >= ETAPES.length) ? 'Voir le trésor' : 'Étape suivante';
    montrer('ecran-succes');
  }

  function rendreFinal() {
    $('final-equipe').textContent = etat.equipe || '';
    $('final-chef').textContent = etat.chef || '';
    $('final-chef-bloc').hidden = !etat.chef;
    const rep = etat.reportes || [];
    $('final-reportes').hidden = rep.length === 0;
    $('final-reportes-liste').innerHTML = rep.map((t) => `<li>${t}</li>`).join('');
    $('final-whatsapp').href = `https://wa.me/${CONFIG.whatsapp || ''}?text=${encodeURIComponent(`Équipage « ${etat.equipe || '?'} » : voici nos chefs-d'œuvre en retard (${rep.join(', ')})`)}`;
    $('final-temps').textContent = formatDuree((etat.fin || Date.now()) - etat.debut);
    montrer('ecran-final');
  }

  // ---------- Événements ----------
  $('btn-splash').addEventListener('click', () => { splashVu = true; rendre(); });

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
      setTimeout(validerEtape, 600);
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
  if (PARAMS.has('animateur')) ouvrirAnimateur();

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
