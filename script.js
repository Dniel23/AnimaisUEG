document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-doacao');
    const pixArea = document.getElementById('pix-area');
    const qrCodeDiv = document.getElementById('pix-qrcode');
    const copiaColaText = document.getElementById('pix-copia-cola');
    const statusPagamento = document.getElementById('status-pagamento');
    const btnDownload = document.getElementById('btn-download');

    let currentPaymentId = null;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nome = document.getElementById('nome').value;
        const valor = document.getElementById('valor').value;

        // Mostra uma mensagem de "carregando"
        form.querySelector('button').innerText = 'Gerando...';
        form.querySelector('button').disabled = true;

        try {
            // Chama a nossa API no backend
            const response = await fetch('animaisueg-production.up.railway.app/gerar-pagamento', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ valor, nome }),
            });

            const data = await response.json();

            if (data.id) {
                currentPaymentId = data.id;
                // Exibe a área do PIX
                qrCodeDiv.innerHTML = `<img src="data:image/png;base64,${data.qr_code_base64}" alt="PIX QR Code">`;
                copiaColaText.value = data.copia_e_cola;
                pixArea.classList.remove('hidden');
                form.classList.add('hidden');

                // Começa a verificar o status do pagamento
                verificarStatusPagamento();
            } else {
                alert('Erro ao gerar o PIX. Tente novamente.');
            }

        } catch (error) {
            console.error('Erro:', error);
            alert('Ocorreu um erro no servidor. Tente mais tarde.');
        } finally {
            form.querySelector('button').innerText = 'Gerar PIX para Doação';
            form.querySelector('button').disabled = false;
        }
    });

    function verificarStatusPagamento() {
        if (!currentPaymentId) return;

        const interval = setInterval(async () => {
            try {
                // CORREÇÃO 1: URL completa para verificar o status
                const response = await fetch(`https://animaisueg-production.up.railway.app/status-pagamento/${currentPaymentId}`);
                const data = await response.json();

                if (data.status === 'approved') {
                    clearInterval(interval);
                    statusPagamento.innerText = 'Pagamento confirmado! Seu certificado está pronto.';
                    statusPagamento.style.color = 'green';
                    btnDownload.disabled = false;
                    btnDownload.onclick = () => {
                        //URL completa para gerar o certificado
                        window.open(`https://animaisueg-production.up.railway.app/gerar-certificado?id=${currentPaymentId}`, '_blank');
                    };
                }
            } catch (error) {
                console.error('Erro ao verificar status:', error);
                // Opcional: parar de verificar se houver muitos erros para não sobrecarregar
                // clearInterval(interval); 
            }
        }, 5000); // Verifica a cada 5 segundos
    }
});
