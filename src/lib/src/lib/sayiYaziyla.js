const birler = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz']
const onlar = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan']

function ucBasamakYaz(n) {
  let s = ''
  const yuz = Math.floor(n / 100)
  const kalan = n % 100
  const on = Math.floor(kalan / 10)
  const bir = kalan % 10
  if (yuz > 0) s += (yuz === 1 ? '' : birler[yuz]) + 'Yüz'
  s += onlar[on]
  s += birler[bir]
  return s
}

// Sayıyı Türkçe yazıya çevirir (örn. 55500 -> "ElliBeşBinBeşYüz")
export function sayiYaziyla(n) {
  n = Math.round(Number(n) || 0)
  if (n === 0) return 'Sıfır'
  const gruplar = ['', 'Bin', 'Milyon', 'Milyar']
  const parcalar = []
  let num = n
  while (num > 0) {
    parcalar.push(num % 1000)
    num = Math.floor(num / 1000)
  }
  let result = ''
  for (let i = parcalar.length - 1; i >= 0; i--) {
    if (parcalar[i] === 0) continue
    let parca = ucBasamakYaz(parcalar[i])
    if (i === 1 && parcalar[i] === 1) parca = ''
    result += parca + gruplar[i]
  }
  return result
}

// Tutarı makbuzlarda kullanılan "#₺55.500,00# (#ElliBeşBinBeşYüzTL#)" biçimine çevirir
export function tutarYaziyla(n) {
  const para = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n || 0)
  return `${para} (${sayiYaziyla(n)}TL)`
}
