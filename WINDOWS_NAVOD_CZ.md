# Koupaliste POS na Windows

## 1. Instalace

1. Nainstaluj **Node.js LTS** z `https://nodejs.org/`.
2. Stahni projekt z GitHubu.
3. Otevri slozku `koupaliste-pos`.
4. Dvojklikem spust `start-windows.cmd`.

Pri prvnim spusteni se automaticky nainstaluji zavislosti a otevře se pokladna:

`http://localhost:5050`

## PINy

- Zmrzlina: `1111`
- Bouda: `3333`
- Truck: `4444`
- Admin: `9999`

## Vypnuti

Zavri okno serveru nebo stiskni `Ctrl+C`.

## Aktualizace

1. Vypni pokladnu.
2. Dvojklikem spust `aktualizovat.cmd`.
3. Po dokonceni spust znovu `start-windows.cmd`.

Pri prvnim spusteni po aktualizaci se mohou znovu nainstalovat moduly.
Aktualizace stahuje verejny repozitar `Sikyshow/koupaliste-pos`, proto neni potreba zadny token.

## Data

Data se ukladaji do uzivatelske slozky Windows v `.koupaliste-pos/koupaliste.db`.
