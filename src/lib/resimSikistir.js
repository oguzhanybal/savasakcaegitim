// Kullanıcının yüklediği bir fotoğrafı (ödev kağıdı fotoğrafı gibi), Supabase
// Storage'daki ücretsiz depolama kotasını (free plan'da toplam 1 GB) gereksiz
// yere doldurmasın diye YÜKLEMEDEN ÖNCE tarayıcıda küçültüp yeniden sıkıştırır.
// Telefonla çekilen fotoğraflar genelde 3-8 MB civarındayken, bu işlemden
// sonra genelde 150-400 KB'a iner — yazı/kağıt fotoğrafı için okunabilirlik
// kaybı olmadan (1600px kenar zaten A4 bir sayfayı ekranda/basılı okumak için
// fazlasıyla yeterli çözünürlüktür).
//
// dosya: <input type="file"> için gelen File nesnesi.
// Resim değilse (ör. PDF) DOKUNMADAN olduğu gibi geri döner.
export function resmiSikistir(dosya, { maksimumKenar = 1600, kalite = 0.75 } = {}) {
  return new Promise((resolve) => {
    if (!dosya || !dosya.type || !dosya.type.startsWith('image/')) {
      resolve(dosya)
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(dosya)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maksimumKenar || height > maksimumKenar) {
        if (width > height) {
          height = Math.round((height * maksimumKenar) / width)
          width = maksimumKenar
        } else {
          width = Math.round((width * maksimumKenar) / height)
          height = maksimumKenar
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          // Sıkıştırma bir sebeple başarısız olursa (ör. tarayıcı desteklemiyorsa)
          // yüklemeyi tamamen engellemek yerine orijinal dosyayı gönderiyoruz.
          if (!blob) {
            resolve(dosya)
            return
          }
          const yeniAd = dosya.name.replace(/\.[^./\\]+$/, '') + '.jpg'
          resolve(new File([blob], yeniAd, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        kalite
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(dosya)
    }
    img.src = url
  })
}
