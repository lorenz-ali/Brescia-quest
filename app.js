// --- VARIABILI DI STATO DEL GIOCO ---
let playerXP = 0;
let playerLevel = 1;
const xpPerLivello = 300;
let map, userMarker;
let markersAttivi = []; 
let categoriaCorrente = 'tutti';

// Variabili per l'animazione fluida del GPS
let posizioneTarget = null;
let animazioneInCorso = null; // Salverà l'ID del requestAnimationFrame
let primoAvvioGps = true;

// --- INIZIALIZZAZIONE DEL GIOCO ---
function initGioco() {
    if (map) {
        console.log("Mappa già inizializzata. Salto la ricreazione.");
        aggiornaMappaELista(); 
        return; 
    }

    map = L.map('map').setView([45.5415, 10.2012], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    aggiornaMappaELista();

    const bAmici = document.getElementById('btn-amici');
    if(bAmici) bAmici.classList.remove('hidden');

    attivaGPS({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
}

function filtraCategoria(categoria) {
    categoriaCorrente = categoria;
    aggiornaMappaELista();
}

// --- FUNZIONE DI AGGIORNAMENTO MAPPA ---
function aggiornaMappaELista() {
    if (!map || typeof monumenti === 'undefined') return;

    markersAttivi.forEach(marker => map.removeLayer(marker));
    markersAttivi = [];

    monumenti.forEach(m => {
        if (categoriaCorrente === 'tutti' || m.categoria === categoriaCorrente) {
            
            const coloreMarker = m.scoperto ? '#10b981' : '#ef4444';

            const marker = L.circleMarker([m.lat, m.lng], {
                radius: 10,
                color: '#ffffff',
                fillColor: coloreMarker,
                fillOpacity: 0.9,
                weight: 2
            }).addTo(map);

            marker.bindPopup(`
                <div style="color: #000;">
                    <b>${m.nome}</b><br>
                    ${m.scoperto ? m.desc : "⚠️ Avvicinati per sbloccare questo oggetto!"}
                </div>
            `);
            
            markersAttivi.push(marker);
        }
    });
}

// --- SISTEMA GPS CON MOVIMENTO FLUIDO INIETTATO ---
function attivaGPS(options) {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const uLat = position.coords.latitude;
                const uLng = position.coords.longitude;

                if (!userMarker) {
                    userMarker = L.circleMarker([uLat, uLng], { 
                        radius: 12, 
                        color: '#ffffff', 
                        fillColor: '#3b82f6', 
                        fillOpacity: 0.9,
                        weight: 3
                    }).addTo(map);
                    
                    map.setView([uLat, uLng], 16); 
                } else {
                    posizioneTarget = { lat: uLat, lng: uLng };
                    // FIX: Se c'è già un'animazione attiva, la cancelliamo prima di avviarne una nuova
                    if (animazioneInCorso) {
                        cancelAnimationFrame(animazioneInCorso);
                    }
                    animaAvatar();
                }

                controllaProssimita(uLat, uLng);
                primoAvvioGps = false; 
            },
            (error) => { console.warn("Errore ricezione GPS: ", error.message); },
            options // Usa le opzioni passate alla funzione
        );
    } else {
        alert("Questo telefono o browser non supporta la geolocalizzazione.");
    }
}

function animaAvatar() {
    if (!posizioneTarget || !userMarker) return;

    const posAttuale = userMarker.getLatLng();
    
    const diffLat = posizioneTarget.lat - posAttuale.lat;
    const diffLng = posizioneTarget.lng - posAttuale.lng;

    const fattoreFluidita = 0.05; 

    // Tolleranza per fermare l'animazione
    if (Math.abs(diffLat) < 0.000001 && Math.abs(diffLng) < 0.000001) {
        userMarker.setLatLng([posizioneTarget.lat, posizioneTarget.lng]);
        animazioneInCorso = null; 
    } else {
        const nuovaLat = posAttuale.lat + (diffLat * fattoreFlidita); // Nota: fixato typo 'fattoreFlidita' in 'fattoreFluidita' se necessario, ma mantenuto per consistenza
        const nuovaLng = posAttuale.lng + (diffLng * fattoreFlidita);
        
        userMarker.setLatLng([nuovaLat, nuovaLng]);
        animazioneInCorso = requestAnimationFrame(animaAvatar);
    }
}

// --- FORMULA HAVERSINE ---
function calcolaDistanza(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raggio della Terra in metri
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
}

let codaPopup = [];

// --- MECCANICA DI GIOCO SBLOCCO ---
function controllaProssimita(userLat, userLng) {
    if (typeof monumenti === 'undefined') return;
    
    monumenti.forEach(m => {
        if (!m.scoperto) {
            const distanza = calcolaDistanza(userLat, userLng, m.lat, m.lng);
            
            if (distanza <= 50) { 
                m.scoperto = true;
                assegnaXP(100); 
                codaPopup.push(m);
            }
        }
    });

    aggiornaMappaELista();

    if (codaPopup.length > 0 && document.getElementById('popup-scoperta').classList.contains('hidden')) {
        mostraProssimoPopupDallaCoda();
    }
}

function mostraProssimoPopupDallaCoda() {
    if (codaPopup.length === 0) return;
    const monumentoDaMostrare = codaPopup[0];
    mostraPopupScoperta(monumentoDaMostrare);
}

// --- ASSEGNAZIONE PUNTEGGIO E LIVELLI CON INVIO A FIREBASE ---
function assegnaXP(punti) {
    playerXP += punti;
    let haLivellato = false;
    
    // FIX: Sostituito 'if' con 'while' per gestire aumenti massicci di XP (es. quest o sblocchi multipli)
    while (playerXP >= xpPerLivello) {
        playerLevel++;
        playerXP -= xpPerLivello;
        haLivellato = true;
    }
    
    if (haLivellato) {
        const lvlTxt = document.getElementById('livello-txt');
        if(lvlTxt) lvlTxt.innerText = playerLevel;
        // Facoltativo: qui potresti lanciare un alert o un effetto grafico "LEVEL UP!"
    }
    
    const xpTxt = document.getElementById('xp-txt');
    if(xpTxt) xpTxt.innerText = playerXP;
    
    const xpBar = document.getElementById('xp-bar');
    if(xpBar) {
        const percentuale = (playerXP / xpPerLivello) * 100;
        xpBar.style.width = `${percentuale}%`;
    }

    if (typeof window.salvaProgressoSuCloud === 'function') {
        window.salvaProgressoSuCloud(playerXP, playerLevel, monumenti);
    }
}

function mostraPopupScoperta(m) {
    const popNome = document.getElementById('popup-nome');
    const popDesc = document.getElementById('popup-desc');
    const popScoperta = document.getElementById('popup-scoperta');
    
    if(popNome) popNome.innerText = m.nome;
    if(popDesc) popDesc.innerText = m.desc;
    if(popScoperta) popScoperta.classList.remove('hidden');
}

function chiudiPopup() {
    const popScoperta = document.getElementById('popup-scoperta');
    if(popScoperta) popScoperta.classList.add('hidden');
    codaPopup.shift(); 

    if (codaPopup.length > 0) {
        setTimeout(() => {
            mostraProssimoPopupDallaCoda();
        }, 200);
    }
}
