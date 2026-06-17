# Koupaliště POS

Samostatná mobilní webová pokladna pro stánek na koupališti.

## PINy

- Zmrzlina: `1111`
- Bouda: `3333`
- Truck: `4444`
- Admin: `9999`

## První menu

- Kopeček zmrzliny: 35 Kč
- Párek v rohlíku: 45 Kč
- Klobáska: 90 Kč
- Kukuřice: 50 Kč

## Spuštění

### macOS / Linux

```bash
cd koupaliste-pos
npm install
npm start
```

Pak otevři:

- na počítači: `http://localhost:5050`
- na telefonu ve stejné Wi-Fi: `http://IP_ADRESA_PC:5050`

Data se ukládají do `~/.koupaliste-pos/koupaliste.db`.

### Windows

Na Windows otevři složku `koupaliste-pos` a spusť:

```bat
start-windows.cmd
```

Podrobněji viz `WINDOWS_NAVOD_CZ.md`.
