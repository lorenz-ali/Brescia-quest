 // --- VARIABILI DI STATO DEL GIOCO ---
let playerXP = 0;
let playerLevel = 1;
const xpPerLivello = 300;
let map, userMarker;
let markersAttivi = []; 
let categoriaCorrente = 'tutti';

// Variabili per l'animazione fluida del GPS
let posizioneTarget = null;
let animazioneInCorso = null;
let primoAvvioGps = true; // Impedisce ai popup a catena di saltare fuori al primissimo avvio

// --- INIZIALIZZAZIONE DEL GIOCO ---

function initGioco() {
    // 🛡️ CONTROLLO DI SICUREZZA: Se la mappa è già stata creata, fermati qui ed evita l'errore!
    if (map) {
        console.log("Mappa già inizializzata. Salto la ricreazione.");
        aggiornaMappaELista(); // Ci assicuriamo solo che i PIN siano aggiornati
        return; 
    }

    // Se non esiste, la crea normalmente come prima
    map = L.map('map').setView([45.5415, 10.2012], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    aggiornaMappaELista();

    attivaGPS({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
}

// --- GESTIONE DEI FILTRI E DEI PIN ---
function aggiornaMappaELista() {
    markersAttivi.forEach(m => map.removeLayer(m));
    markersAttivi = [];

    const containerLista = document.getElementById('lista-monumenti');
    containerLista.innerHTML = "";

    monumenti.forEach(m => {
        if (categoriaCorrente === 'tutti' || m.categoria === categoriaCorrente) {
            
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            
            if (m.scoperto) {
                marker.bindPopup(`<b>✅ ${m.nome}</b><br>${m.desc}`);
            } else {
                marker.bindPopup(`<b>🔒 Luogo Bloccato</b><br>Avvicinati a meno di 50 metri con il GPS per conquistare questo obiettivo!`);
            }
            
            markersAttivi.push(marker);
            m.markerRef = marker;

            const item = document.createElement('div');
            item.className = `p-3 rounded-xl flex justify-between items-center transition-all ${
                m.scoperto ? 'bg-green-950/40 border border-green-500' : 'bg-gray-700/50 border border-gray-600'
            }`;
            
            item.innerHTML = `
                <div>
                    <p class="font-semibold text-sm ${m.scoperto ? 'text-green-400' : 'text-gray-200'}">${m.nome}</p>
                    <p class="text-xs text-gray-400 font-mono">${m.scoperto ? '🟢 Obiettivo Conquistato' : '🔒 Distanza: Calcolo in corso...'}</p>
                </div>
                <div class="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded-md">
                    ${m.scoperto ? '🏆' : '+100 XP'}
                </div>
            `;
            containerLista.appendChild(item);
        }
    });
}

function filtraCategoria(categoria) {
    categoriaCorrente = categoria;
    aggiornaMappaELista();
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
                    if (!animazioneInCorso) {
                        animaAvatar();
                    }
                }

                controllaProssimita(uLat, uLng);
                
                // Dopo il primo controllo della posizione, disattiviamo il blocco dei popup
                primoAvvioGps = false; 
            },
            (error) => { console.warn("Errore ricezione GPS: ", error.message); },
            { enableHighAccuracy: true }
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

    const fattoreFlidita = 0.05; 

    if (Math.abs(diffLat) < 0.00001 && Math.abs(diffLng) < 0.00001) {
        userMarker.setLatLng([posizioneTarget.lat, posizioneTarget.lng]);
        animazioneInCorso = null; 
    } else {
        const nuovaLat = posAttuale.lat + (diffLat * fattoreFlidita);
        const nuovaLng = posAttuale.lng + (diffLng * fattoreFlidita);
        
        userMarker.setLatLng([nuovaLat, nuovaLng]);
        animazioneInCorso = requestAnimationFrame(animaAvatar);
    }
}

// --- FORMULA HAVERSINE ---
function calcolaDistanza(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
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
// 1. Crea una lista (coda) vuota all'esterno per accumulare i popup
let codaPopup = [];

// --- MECCANICA DI GIOCO SBLOCCO REGISTRATO SU CLOUD ---
function controllaProssimita(userLat, userLng) {
    // Ripristiniamo il ciclo corretto che mancava!
    monumenti.forEach(m => {
        if (!m.scoperto) {
            const distanza = calcolaDistanza(userLat, userLng, m.lat, m.lng);
            
            // Il tuo raggio di 50km per i test da PC
            if (distanza <= 50000) { 
                m.scoperto = true;
                assegnaXP(100); // Questo invierà anche i dati a Firebase
                
                // Mettiamo il monumento in coda per il popup grafico
                codaPopup.push(m);
            }
        }
    });

    aggiornaMappaELista();

    // Se ci sono monumenti sbloccati nella coda E la schermata non è già occupata da un popup, mostra il primo!
    if (codaPopup.length > 0 && document.getElementById('popup-scoperta').classList.contains('hidden')) {
        mostraProssimoPopupDallaCoda();
    }
}

// Funzione di supporto per estrarre e mostrare il primo popup disponibile
function mostraProssimoPopupDallaCoda() {
    if (codaPopup.length === 0) return;
    
    const monumentoDaMostrare = codaPopup[0]; // Prende il primo della lista
    mostraPopupScoperta(monumentoDaMostrare);
}

// --- ASSEGNAZIONE PUNTEGGIO E LIVELLI CON INVIO A FIREBASE ---
function assegnaXP(punti) {
    playerXP += punti;
    
    if (playerXP >= xpPerLivello) {
        playerLevel++;
        playerXP -= xpPerLivello;
        document.getElementById('livello-txt').innerText = playerLevel;
    }
    
    document.getElementById('xp-txt').innerText = playerXP;
    const percentuale = (playerXP / xpPerLivello) * 100;
    document.getElementById('xp-bar').style.width = `${percentuale}%`;

    // ☁️ Salva su Firebase usando la funzione globale dell'index.html
    if (typeof window.salvaProgressoSuCloud === 'function') {
        window.salvaProgressoSuCloud(playerXP, playerLevel, monumenti);
    }
}

function mostraPopupScoperta(m) {
    document.getElementById('popup-nome').innerText = m.nome;
    document.getElementById('popup-desc').innerText = m.desc;
    document.getElementById('popup-scoperta').classList.remove('hidden');
}

// Modifichiamo la chiusura: quando clicchi, scarta il popup vecchio e passa al successivo!
function chiudiPopup() {
    document.getElementById('popup-scoperta').classList.add('hidden');

    codaPopup.shift(); // Elimina il popup appena visto dalla lista

    // Se ci sono altri obiettivi sbloccati che aspettano, mostra il prossimo dopo un istante
    if (codaPopup.length > 0) {
        setTimeout(() => {
            mostraProssimoPopupDallaCoda();
        }, 200);
    }
}
