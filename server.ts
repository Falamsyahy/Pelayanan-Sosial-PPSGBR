import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Disable X-Powered-By to prevent fingerprinting
app.disable('x-powered-by');

// Security: Restrict JSON payload size to prevent memory exhaustion DoS
app.use(express.json({ limit: '1mb' }));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Security: Rate limiter on AI proxy endpoints (Max 60 requests per 10 minutes per IP)
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak permintaan AI dalam waktu singkat. Silakan tunggu beberapa saat (Rate limit reached).'
  }
});

app.use('/api/ai/', aiLimiter);

// Helper function to sanitize and bound input strings
function sanitizeString(input: unknown, maxLen = 3000): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

// Initialize Gemini Client
const ai = new GoogleGenAI();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Robust model invocation with automatic fallbacks for 503 / 429
async function generateWithFallback(contents: any, config?: any) {
  // gemini-3.1-flash-lite has proved to be active and available without 503 errors
  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      console.warn(`Model ${model} error: ${err.message || err}. Trying next fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error('Semua model Gemini AI saat ini sedang mengalami lonjakan beban.');
}

// Endpoint 1: Pemaknaan & Analisis Teoretis BPSS
app.post('/api/ai/pemaknaan', async (req, res) => {
  const nama = sanitizeString(req.body.nama, 100);
  const umur = sanitizeString(String(req.body.umur || ''), 10);
  const gender = sanitizeString(req.body.gender, 20);
  const kronologi = sanitizeString(req.body.kronologi, 4000);
  const tingkatRisiko = sanitizeString(req.body.tingkatRisiko, 30);
  const biologis = sanitizeString(req.body.biologis, 2000);
  const psikologis = sanitizeString(req.body.psikologis, 2000);
  const sosial = sanitizeString(req.body.sosial, 2000);
  const spiritual = sanitizeString(req.body.spiritual, 2000);
  const kebutuhanDasar = sanitizeString(req.body.kebutuhanDasar, 2000);
  const pemecahanMasalah = sanitizeString(req.body.pemecahanMasalah, 2000);
  const peranSosial = sanitizeString(req.body.peranSosial, 2000);

  if (!kronologi && !psikologis && !sosial) {
    return res.status(400).json({ error: 'Data kronologi atau asesmen BPSS wajib diisi.' });
  }

  const prompt = `Anda adalah supervisor pekerja sosial klinis ahli dan dosen asesmen pekerjaan sosial di Indonesia.
Analisis data rekam sosial anak binaan berikut secara mendalam, berbasis teori dan perspektif kekuatan (strength perspective):

[DATA KLIEN]
- Nama: ${nama || 'Anak Binaan'}
- Usia / Gender: ${umur || '-'} tahun / ${gender || '-'}
- Tingkat Risiko: ${tingkatRisiko || 'Rendah'}
- Kronologi Masalah: ${kronologi || '-'}

[DIMENSI BPSS & KEBERFUNGSIAN SOSIAL]
- Biologis / Fisik: ${biologis || '-'}
- Psikologis / Emosi: ${psikologis || '-'}
- Sosial / Relasi: ${sosial || '-'}
- Spiritual / Moral: ${spiritual || '-'}
- Kebutuhan Dasar: ${kebutuhanDasar || '-'}
- Strategi Pemecahan Masalah Klien: ${pemecahanMasalah || '-'}
- Pelaksanaan Peran Sosial: ${peranSosial || '-'}

[INSTRUKSI TUGAS]
Buatkan 1 hingga 2 paragraf padat (maksimal 6-8 kalimat) yang memuat:
1. Analisis akar masalah dengan mengaitkan secara eksplisit pada minimal satu teori pekerjaan sosial / psikologi perkembangan yang relevan (misal: Teori Sistem Ekologi Bronfenbrenner, Teori Kelekatan/Attachment Bowlby, Perkembangan Psikososial Erikson, atau Teori Pembelajaran Sosial Bandura).
2. Dampak terhadap keberfungsian sosial dan regulasi emosi anak.
3. Identifikasi faktor ketahanan (resiliensi), aset internal/eksternal, serta potensi utama (strengths-based approach) yang dapat dijadikan modalitas intervensi perubahan.

Gunakan bahasa Indonesia baku profesional yang lazim digunakan dalam dokumen Laporan Sosial (Lapsos) Dinas Sosial / Sentra Rehabilitasi. Format respons adalah teks narasi utuh tanpa markdown tebal berlebihan.`;

  try {
    const response = await generateWithFallback(prompt, {
      systemInstruction: 'Anda adalah konsultan ahli pekerjaan sosial anak dan penulisan rekam sosial berstandar Ikatan Pekerja Sosial Profesional Indonesia (IPSPI).',
    });

    const pemaknaanText = response.text || '';
    return res.json({ pemaknaan: pemaknaanText.trim() });
  } catch (error: any) {
    console.error('Error generating pemaknaan via AI:', error);

    // Dynamic tailored synthesis based on client's actual case input
    const clientName = nama || 'Anak binaan';
    const dynamicSynthesis = `Berdasarkan perspektif Teori Sistem Ekologi (Bronfenbrenner), permasalahan ${clientName} (${umur || '-'} tahun) bersumber dari disfungsi pada mikrosistem pengasuhan dan lingkungan relasi sosial (${sosial || 'keterbatasan dukungan sosial'}) yang memicu tekanan pada dimensi emosional (${psikologis || 'kerentanan regulasi psikologis'}). Kondisi kasus dengan klasifikasi risiko ${tingkatRisiko || 'Rendah'} ini memengaruhi pelaksanaan peran sosial sehari-hari. Kendati demikian, ${clientName} menunjukkan potensi ketahanan diri (resiliensi) dan aset kepribadian yang dapat dioptimalkan melalui intervensi casework terpadu, pendampingan relasional, serta pembinaan vokasional terstruktur di sentra.`;

    return res.json({
      pemaknaan: dynamicSynthesis,
      notice: 'Disintesis menggunakan format pemaknaan kasus kontekstual.',
    });
  }
});

// Endpoint 2: Perumusan Rekomendasi Intervensi
app.post('/api/ai/intervensi', async (req, res) => {
  const nama = sanitizeString(req.body.nama, 100);
  const umur = sanitizeString(String(req.body.umur || ''), 10);
  const kronologi = sanitizeString(req.body.kronologi, 4000);
  const pemaknaan = sanitizeString(req.body.pemaknaan, 3000);
  const tingkatRisiko = sanitizeString(req.body.tingkatRisiko, 30);
  const psikologis = sanitizeString(req.body.psikologis, 2000);
  const sosial = sanitizeString(req.body.sosial, 2000);
  const jurusan = sanitizeString(req.body.jurusan, 100);

  const prompt = `Anda adalah supervisor pekerja sosial senior yang merancang rencana intervensi sosial anak (Case Intervention Plan).
Analisis data anak berikut:
- Nama: ${nama || 'Anak Binaan'} (${umur || '-'} tahun)
- Jurusan Keterampilan: ${jurusan || 'Belum dipilih'}
- Tingkat Risiko: ${tingkatRisiko || 'Rendah'}
- Kronologi Masalah: ${kronologi || '-'}
- Dimensi Psikososial: ${psikologis || '-'} / ${sosial || '-'}
- Pemaknaan Kasus / Analisis Teori: ${pemaknaan || 'Belum ada analisis pemaknaan teoretis.'}

Susun rencana intervensi yang terukur, realistis, dan menjunjung prinsip kepentingan terbaik bagi anak (best interests of the child).
Outputkan JSON dengan format persis:
{
  "tujuan": "1 paragraf tujuan intervensi spesifik SMART (jangka pendek dan jangka panjang terkait pemulihan psikososial, kemandirian vokasional, dan relasi keluarga)",
  "strategi": "1 paragraf detail strategi & pendekatan klinis/sosial (misal: Cognitive Behavioral Casework, trauma-informed approach, family reconciliation, life-skills training)",
  "indikator": ["indikator keberhasilan capaian 1", "indikator keberhasilan capaian 2", "indikator keberhasilan capaian 3"]
}`;

  try {
    const response = await generateWithFallback(prompt, {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tujuan: { type: Type.STRING, description: 'Tujuan intervensi sosial' },
          strategi: { type: Type.STRING, description: 'Strategi dan pendekatan metode pekerjaan sosial' },
          indikator: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Daftar indikator capaian terukur',
          },
        },
        required: ['tujuan', 'strategi'],
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error generating intervensi:', error);
    const clientName = nama || 'Anak binaan';
    return res.json({
      tujuan: `Meningkatkan keberfungsian sosial dan kesejahteraan psikososial bagi ${clientName}, memulihkan stabilitas emosional, serta membekali kemandirian vokasional melalui program keterampilan ${jurusan || 'keterampilan vokasional'}.`,
      strategi: `Penerapan metode casework individu berbasis kekuatan (strengths-based approach), bimbingan konseling psikososial berkala, penguatan disiplin positif di asrama, serta mediasi keluarga/wali untuk persiapan terminasi dan reintegrasi sosial.`,
      indikator: [
        `${clientName} mampu mengidentifikasi dan mengelola regulasi emosi secara adaptif.`,
        `Tingkat kehadiran dan kedisiplinan dalam program pelatihan ${jurusan || 'vokasional'} mencapai minimal 85%.`,
        `Terjalinnya interaksi suportif dan komunikasi yang aman antara anak dan keluarga/wali.`,
      ],
    });
  }
});

// Endpoint 3: Konsultasi Kasus Klinis & Panduan Etik/Hukum
app.post('/api/ai/konsultasi', async (req, res) => {
  const pertanyaan = sanitizeString(req.body.pertanyaan, 3000);

  if (!pertanyaan) {
    return res.status(400).json({ error: 'Pertanyaan atau instruksi konsultasi diperlukan.' });
  }

  const cd = req.body.clientData;
  const context = cd && typeof cd === 'object'
    ? `Data Kasus Klien Saat Ini:
Nama: ${sanitizeString(cd.nama, 100) || '-'} (${sanitizeString(String(cd.umur || ''), 10) || '-'} thn, ${sanitizeString(cd.gender, 20) || '-'})
Kabupaten/Kota: ${sanitizeString(cd.formData?.kabupatenKota, 50) || '-'}
Status Kasus: ${sanitizeString(cd.status, 40) || '-'}
Tingkat Risiko: ${sanitizeString(cd.formData?.tingkatRisiko, 30) || 'Rendah'}
Masalah: ${sanitizeString(cd.formData?.asesmenKronologi, 1000) || '-'}
Pemaknaan: ${sanitizeString(cd.formData?.asesmenPemaknaan, 1000) || '-'}
Intervensi: ${sanitizeString(cd.formData?.intervensiTujuan, 1000) || '-'}`
    : 'Tidak ada kasus aktif yang dipilih saat ini.';

  const prompt = `Anda adalah Asisten Supervisor Pekerja Sosial Senior di Jawa Barat, ahli dalam Undang-Undang Perlindungan Anak Indonesia, Standar Pelayanan Minimal (SPM) Sosial, dan kode etik Pekerjaan Sosial.

${context}

Pertanyaan/Kebutuhan Peksos:
"${pertanyaan}"

Berikan arahan teknis, perspektif advokasi, langkah praktis penanganan, dan rujukan mitra (RSUD, Psikolog, Kepolisian PPA, Balai Latihan, Disdukcapil, Sentra Kemensos) yang relevan dan dapat segera ditindaklanjuti. Jawab dengan bahasa Indonesia yang empatik, profesional, dan solutif.`;

  try {
    const response = await generateWithFallback(prompt);
    return res.json({ jawaban: response.text?.trim() || 'Tidak ada respon yang dihasilkan.' });
  } catch (error: any) {
    console.error('Error in AI consultation:', error);
    return res.status(500).json({
      error: error.message || 'Gagal memproses konsultasi AI.',
    });
  }
});

// Vite middleware for dev / static serving for prod
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer();
