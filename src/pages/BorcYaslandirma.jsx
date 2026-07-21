import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  paraFormat,
  bireBirBorclariOlustur,
  kantinBorclariOlustur,
  ogrenciBorcYaslandirmaHesapla,
  yasKovasiHesapla,
  whatsappLinkOlusturTelefonIcin,
} from '../lib/ekstreHesap'

function suankiAy() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

const KOVA_SIRASI = ['0-30', '31-60', '61-90', '90+']
const KOVA_ETIKET = { '0-30': '0-30 gün', '31-60': '31-60 gün', '61-90': '61-90 gün', '90+': '90+ gün' }
const KOVA_RENK = {
  '0-30': 'bg-amber-50 text-amber-700 border-amber-200',
  '31-60': 'bg-orange-50 text-orange-700 border-orange-200',
  '61-90': 'bg-red-50 text-red-700 border-red-200',
  '90+': 'bg-red-100 text-red-800 border-red-300',
}
const KOVA_ROZET = {
  '0-30': 'bg-amber-100 text-amber-800',
  '31-60': 'bg-orange-100 text-orange-800',
  '61-90': 'bg-red-100 text-red-700',
  '90+': 'bg-red-200 text-red-900',
}

// ============================================================================
// BORÇ YAŞLANDIRMA (TAHSİLAT RİSK RAPORU) — TÜM öğrencileri (Fatura Ortağı
// gruplarıyla birlikte) tek listede, VADESİ GEÇMİŞ borcu olanları en eski
// gecikmeden başlayarak sıralar. Amaç: ay sonunda tek tek her öğrencinin
// ekstresine bakmak yerine, "önce kimi aramam lazım" sorusuna anında cevap
// vermek. Hesap mantığı ekstreHesap.js > ogrenciBorcYaslandirmaHesapla
// üzerinden Muhasebe.jsx'teki taksit/borç tablolarıyla BİREBİR TUTARLI —
// burada sadece sonuçlar vade tarihine göre kovalara ayrılıp sıralanıyor.
// Sadece yönetici erişebilir (App.jsx'te kısıtlı).
// ============================================================================
export default function BorcYaslandirma() {
  const [ogrenciler, setOgrenciler] = useState([])
  const [sozlesmeler, setSozlesmeler] = useState([])
  const [aylikBorclar, setAylikBorclar] = useState([])
  const [odemeler, setOdemeler] = useState([])
  const [loading, setLoading] = useState(true)
  const [arama, setArama] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('ogrenciler').select('*').order('ad_soyad'),
      supabase.from('sozlesmeler').select('*'),
      supabase.from('aylik_borclar').select('*'),
      supabase.from('odemeler').select('*'),
      supabase.from('bire_bir_atamalari').select('*'),
      supabase.from('bire_bir_yoklama').select('*'),
      supabase.from('kantin_alislar').select('*'),
    ]).then(([o, s, a, od, bba, bby, kantin]) => {
      setOgrenciler(o.data || [])
      setSozlesmeler(s.data || [])
      setAylikBorclar([
        ...(a.data || []),
        ...bireBirBorclariOlustur(bba.data || [], bby.data || []),
        ...kantinBorclariOlustur(kantin.data || []),
      ])
      setOdemeler(od.data || [])
      setLoading(false)
    })
  }, [])

  // Fatura Ortağı gruplarını (ör. ikiz kardeşler) TEK satırda birleştirmek
  // için önce her öğrenciyi "efektif fatura sahibi"ne göre gruplandırıyoruz —
  // TopluEkstre.jsx'teki AYNI mantık, ama burada partner satırları AYRICA
  // tekrar gösterilmesin diye ana öğrenci + ortaklar tek grup nesnesinde.
  const gruplar = useMemo(() => {
    const map = new Map()
    for (const o of ogrenciler) {
      const efektifId = o.fatura_sahibi_id || o.id
      if (!map.has(efektifId)) map.set(efektifId, { efektifId, ana: null, ortaklar: [] })
      const g = map.get(efektifId)
      if (o.id === efektifId) g.ana = o
      else g.ortaklar.push(o)
    }
    return Array.from(map.values()).filter((g) => g.ana)
  }, [ogrenciler])

  const satirlar = useMemo(() => {
    const seciliAy = suankiAy()
    return gruplar
      .map((g) => {
        const grupIds = [g.efektifId, ...g.ortaklar.map((x) => x.id)]
        const oSozlesmeler = sozlesmeler.filter((s) => grupIds.includes(s.ogrenci_id))
        const oAylikBorclar = aylikBorclar.filter((a) => grupIds.includes(a.ogrenci_id))
        const oOdemeler = odemeler.filter((od) => grupIds.includes(od.ogrenci_id))
        const yaslandirma = ogrenciBorcYaslandirmaHesapla(oSozlesmeler, oAylikBorclar, oOdemeler)
        if (!yaslandirma) return null

        // Aynı kalemdeki birden fazla kalemi (ör. birden fazla ayın Bire Bir
        // borcu) tek satırda toplayıp "Kurs: 3.500₺, Bire Bir: 1.200₺" gibi
        // kısa bir özet göstermek için kalem bazında topluyoruz.
        const kalemOzet = new Map()
        for (const k of yaslandirma.kalemler) {
          kalemOzet.set(k.kalem, (kalemOzet.get(k.kalem) || 0) + k.kalanTutar)
        }

        const ana = g.ana
        return {
          efektifId: g.efektifId,
          adSoyad: ana.ad_soyad,
          ortaklar: g.ortaklar,
          durum: ana.durum || 'aktif',
          kalemOzet: Array.from(kalemOzet.entries()),
          toplamKalan: yaslandirma.toplamKalan,
          enEskiVade: yaslandirma.enEskiVade,
          kova: yaslandirma.kova,
          anneWhatsappLink: whatsappLinkOlusturTelefonIcin(ana.anne_telefon, ana.ad_soyad, ana.id, seciliAy, 0, yaslandirma.toplamKalan),
          babaWhatsappLink: whatsappLinkOlusturTelefonIcin(ana.baba_telefon, ana.ad_soyad, ana.id, seciliAy, 0, yaslandirma.toplamKalan),
        }
      })
      .filter(Boolean)
      .filter((r) => r.adSoyad.toLocaleLowerCase('tr-TR').includes(arama.trim().toLocaleLowerCase('tr-TR')))
      .sort((a, b) => a.enEskiVade - b.enEskiVade)
  }, [gruplar, sozlesmeler, aylikBorclar, odemeler, arama])

  // Kova özet kartları — TÜM (aramadan bağımsız, arama sadece tabloyu
  // filtreler) satırlardaki her bir kalemi kendi kovasına göre topluyoruz.
  const kovaToplamlari = useMemo(() => {
    const toplam = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    for (const g of gruplar) {
      const grupIds = [g.efektifId, ...g.ortaklar.map((x) => x.id)]
      const oSozlesmeler = sozlesmeler.filter((s) => grupIds.includes(s.ogrenci_id))
      const oAylikBorclar = aylikBorclar.filter((a) => grupIds.includes(a.ogrenci_id))
      const oOdemeler = odemeler.filter((od) => grupIds.includes(od.ogrenci_id))
      const yaslandirma = ogrenciBorcYaslandirmaHesapla(oSozlesmeler, oAylikBorclar, oOdemeler)
      if (!yaslandirma) continue
      // Kova toplamları, öğrencinin "en eski" kovasına göre DEĞİL, HER
      // kalemin KENDİ vadesine göre hesaplanır — bir öğrencinin hem 20 gün
      // hem 100 gün gecikmiş iki ayrı borcu olabilir, ikisi de kendi doğru
      // kovasında sayılmalı.
      for (const k of yaslandirma.kalemler) {
        const kova = yasKovasiHesapla(k.vade)
        toplam[kova] += k.kalanTutar
      }
    }
    return toplam
  }, [gruplar, sozlesmeler, aylikBorclar, odemeler])

  if (loading) return <p className="text-gray-400">Yükleniyor...</p>

  const genelToplam = satirlar.reduce((t, r) => t + r.toplamKalan, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Borç Yaşlandırma</h1>
      </div>
      <p className="text-gray-500 mb-6 max-w-2xl">
        Vadesi geçmiş (ödenmesi gereken tarihi geçmiş) borcu olan öğrenciler, en eski gecikmeden
        başlayarak sırayla listelenir — ay sonunda kimi aramanız gerektiğine hızlıca karar verin.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {KOVA_SIRASI.map((kova) => (
          <div key={kova} className={`rounded-2xl border p-4 ${KOVA_RENK[kova]}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{KOVA_ETIKET[kova]}</p>
            <p className="text-xl font-bold mt-1">{paraFormat(kovaToplamlari[kova])}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-500 font-medium">Vadesi Geçmiş Toplam Borç</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{paraFormat(genelToplam)}</p>
        </div>
        <p className="text-sm text-gray-500">{satirlar.length} öğrenci/aile grubunda gecikmiş borç var</p>
      </div>

      <input
        type="text"
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        placeholder="Öğrenci ara..."
        className="px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue min-w-[220px] mb-4"
      />

      {satirlar.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center text-green-700 font-medium">
          Harika — vadesi geçmiş borcu olan öğrenci bulunamadı.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50">
                <th className="px-4 py-2 font-medium">Öğrenci</th>
                <th className="px-4 py-2 font-medium">Gecikmiş Kalemler</th>
                <th className="px-4 py-2 font-medium">En Eski Gecikme</th>
                <th className="px-4 py-2 font-medium text-right">Toplam Gecikmiş</th>
                <th className="px-4 py-2 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((r) => {
                const gunSayisi = Math.floor((new Date() - r.enEskiVade) / (1000 * 60 * 60 * 24))
                return (
                  <tr key={r.efektifId} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {r.adSoyad}
                      {r.durum === 'pasif' && (
                        <span className="ml-2 text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pasif</span>
                      )}
                      {r.ortaklar.length > 0 && (
                        <span className="block text-xs font-normal text-purple-600">
                          + {r.ortaklar.map((x) => x.ad_soyad).join(', ')} (birleşik)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.kalemOzet.map(([kalem, tutar]) => `${kalem}: ${paraFormat(tutar)}`).join(', ')}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${KOVA_ROZET[r.kova]}`}>
                        {gunSayisi} gün ({KOVA_ETIKET[r.kova]})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700">{paraFormat(r.toplamKalan)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <Link to={`/ekstre/${r.efektifId}`} target="_blank" className="text-blue text-sm hover:underline mr-3">
                        Ekstre
                      </Link>
                      {r.anneWhatsappLink && (
                        <a href={r.anneWhatsappLink} target="_blank" rel="noreferrer" className="text-green-600 text-sm font-medium hover:underline mr-3">
                          Anneye Gönder
                        </a>
                      )}
                      {r.babaWhatsappLink && (
                        <a href={r.babaWhatsappLink} target="_blank" rel="noreferrer" className="text-green-600 text-sm font-medium hover:underline">
                          Babaya Gönder
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
