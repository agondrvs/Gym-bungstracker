# Gym Tracker

Einfache Web-App (PWA) zum Mitschreiben der Übungen während des Trainings.

## Funktionen
- Sätze mit Wiederholungen und Gewicht speichern
- Bei Körpergewichtsübungen (Klimmzüge, Dips, …) wird **Zusatzgewicht** eingetragen (0 = nur Körpergewicht)
- Anzeige des letzten Satzes pro Übung, Gewicht wird vorbefüllt
- Kalender: Trainingstage sind grün markiert, Tippen auf einen Tag zeigt die Sätze
- Statistik: Trainings und Sätze pro Monat
- Plus/Minus-Knöpfe für schnelle Eingabe im Gym
- Helles und dunkles Design (folgt der Handy-Einstellung)
- Eigene Übungen hinzufügen / entfernen
- Backup als JSON exportieren / importieren
- Funktioniert offline, kann auf den Homescreen gelegt werden

Alle Daten werden lokal im Browser des Geräts gespeichert.

## Starten
Lokal: `python3 -m http.server` im Ordner ausführen und `http://localhost:8000` öffnen.

Aufs Handy: Repo über **GitHub Pages** veröffentlichen (Settings → Pages → Branch wählen),
die URL im Handy-Browser öffnen und „Zum Home-Bildschirm hinzufügen“ wählen.
