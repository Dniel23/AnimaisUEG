require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const cors =require('cors');

// --- 1. MUDANÇA NA IMPORTAÇÃO ---
// Importamos as classes necessárias da nova versão do SDK
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- 2. NOVA FORMA DE CONFIGURAÇÃO ---
// ATENÇÃO: Substitua pelo seu Access Token
// Pegue o seu em: https://www.mercadopago.com.br/developers/panel/credentials
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_TOKEN });

// --- 3. INSTANCIANDO O SERVIÇO DE PAGAMENTO ---
// Criamos uma instância do serviço de Pagamento com o cliente configurado
const payment = new Payment(client);

// Armazenamento temporário (em um projeto real, use um banco de dados)
const doacoes = {};

// --- ROTAS DA API ---

// Rota para criar um pagamento PIX
app.post('/gerar-pagamento', async (req, res) => {
    const { valor, nome } = req.body;
    
    if (!valor || !nome) {
        return res.status(400).json({ error: 'Nome e valor são obrigatórios.' });
    }

    const valorNumerico = parseFloat(valor.toString().replace(',', '.'));

    const payment_data = {
        transaction_amount: valorNumerico,
        description: 'Doação para projeto de apoio aos animais',
        payment_method_id: 'pix',
        payer: {
            email: `doador-${Date.now()}@teste.com`,
            first_name: nome,
        },
        //notification_url: 'URL_DO_SEU_WEBHOOK_AQUI' // Opcional
    };

    try {
        // --- 4. NOVA FORMA DE CHAMAR A API ---
        // Usamos a instância de 'payment' e passamos os dados dentro de um objeto 'body'
        const data = await payment.create({ body: payment_data });
        
        // Salva os dados da doação para gerar o certificado depois
        doacoes[data.id] = {
            nome: nome,
            valor: valorNumerico,
            status: 'pending'
        };

        res.json({
            id: data.id,
            copia_e_cola: data.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (error) {
        console.error('Erro Mercado Pago:', error);
        res.status(500).json({ error: 'Falha ao criar pagamento' });
    }
});

// Rota para verificar o status do pagamento (polling)
app.get('/status-pagamento/:id', async (req, res) => {
    const paymentId = req.params.id;
    try {
        // --- 5. NOVA FORMA DE BUSCAR UM PAGAMENTO ---
        const data = await payment.get({ id: paymentId });
        
        if (data.status === 'approved' && doacoes[data.id]) {
            doacoes[data.id].status = 'approved';
        }
        
        res.json({ status: data.status });
    } catch (error) {
        console.error('Erro ao consultar status:', error);
        res.status(500).json({ error: 'Falha ao consultar status' });
    }
});

// Rota para gerar o certificado em PDF
app.get('/gerar-certificado', async (req, res) => {
    const paymentId = req.query.id;

    if (!paymentId || !doacoes[paymentId] || doacoes[paymentId].status !== 'approved') {
        return res.status(403).send('Pagamento não confirmado ou inválido.');
    }

    const { nome, valor } = doacoes[paymentId];

    try {
       const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
            ]
        });
        const page = await browser.newPage();
        
        const conteudoHtml = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head><meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');
                body { 
                    font-family: 'Poppins', sans-serif;
                    text-align: center; 
                    border: 15px solid #388E3C; 
                    border-radius: 10px;
                    padding: 50px; 
                    background-color: #f7fdf7;
                }
                .logo {
                    width: 80px;
                    height: 80px;
                    color: #FFA000;
                    margin-bottom: 20px;
                }
                h1 { color: #388E3C; font-size: 48px; font-weight: 700; margin-bottom: 20px; }
                p { font-size: 20px; color: #37474F; }
                .nome { font-size: 36px; color: #FFA000; font-weight: 700; margin: 25px 0; }
                .footer-cert { margin-top: 50px; font-size: 14px; color: #78909C; }
            </style>
            </head>
            <body>
                <svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 00-4.89 1.52 1 1 0 00-.67 1.29 1 1 0 001.29.67A8 8 0 0119 10a1 1 0 002 0 10 10 0 00-9-8zM4 10a1 1 0 000 2 8 8 0 0111.11 6.48 1 1 0 001.29.67 1 1 0 00.67-1.29A10 10 0 004 10zm13 3a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm-6 0a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z"/>
                    <path d="M12 4a8 8 0 00-7.89 6.48 1 1 0 00.67 1.29 1 1 0 001.29-.67A6 6 0 0118 12a1 1 0 002 0A8 8 0 0012 4z"/>
                </svg>
                <h1>Certificado de Doação</h1>
                <p>Com imensa gratidão, certificamos que</p>
                <p class="nome">${nome}</p>
                <p>realizou uma doação no valor de <strong>R$ ${valor.toFixed(2).replace('.',',')}</strong>.</p>
                <p>Sua generosidade e amor pelos animais fazem toda a diferença!</p>
                <p class="footer-cert">Emitido em: ${new Date().toLocaleDateString('pt-BR')}</p>
            </body></html>
        `;

        await page.setContent(conteudoHtml);
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.setHeader('Content-Disposition', `attachment; filename=Certificado-Doacao-${nome}.pdf`);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        res.status(500).send('Erro ao gerar o certificado.');
    }
});


app.listen(port, () => {
    console.log(`Servidor backend rodando em http://localhost:${port}`);
    console.log('Aguardando doações... 🐾');
});
