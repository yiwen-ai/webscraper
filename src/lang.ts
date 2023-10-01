import languages from './languages.json' assert { type: 'json' }

export function lang639_3(lang: string): string {
  const l = lang.toLowerCase()
  for (const vv of languages) {
    if (
      vv[0] == l ||
      vv[1] == l ||
      vv[2].toLowerCase() == l ||
      vv[3].toLowerCase() == l
    ) {
      return vv[1]
    }
  }

  return ''
}

const rtlLanguageCodeList3 = [
  'ara', // Arabic
  'heb', // Hebrew
  'fas', // Persian
  'urd', // Urdu
  'kas', // Kashmiri
  'pus', // Pashto
  'uig', // Uighur
  'snd', // Sindhi
]

export function isRTL(languageCode: string): boolean {
  return rtlLanguageCodeList3.includes(languageCode)
}
