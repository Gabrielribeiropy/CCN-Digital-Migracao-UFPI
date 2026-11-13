"""Gera o PDF local da revisão; o PDF não entra no repositório."""
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.graphics.shapes import Drawing, Circle, String, Rect

HERE = Path(__file__).resolve().parent
OUT = HERE / 'relatorio-auditoria-seguranca.pdf'
NAVY = colors.HexColor('#082b50')
TEAL = colors.HexColor('#059669')
MUTED = colors.HexColor('#60748a')
LINE = colors.HexColor('#dce7f0')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleCCN', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=21, leading=25, textColor=NAVY, spaceAfter=12))
styles.add(ParagraphStyle(name='HCCN', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=NAVY, spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle(name='BodyCCN', parent=styles['BodyText'], fontName='Helvetica', fontSize=8.7, leading=12.4, textColor=NAVY, spaceAfter=6))
styles.add(ParagraphStyle(name='SmallCCN', parent=styles['BodyText'], fontName='Helvetica', fontSize=7.5, leading=10.5, textColor=NAVY))
styles.add(ParagraphStyle(name='CenterCCN', parent=styles['BodyText'], fontName='Helvetica-Bold', fontSize=9, alignment=TA_CENTER, textColor=NAVY))

def P(value, style='BodyCCN'):
    return Paragraph(escape(value), styles[style])

def table(rows, widths):
    data = [[P(str(cell), 'SmallCCN') for cell in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e9f3f7')),
        ('LINEBELOW', (0, 0), (-1, 0), 0.7, LINE),
        ('LINEBELOW', (0, 1), (-1, -1), 0.35, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(2*cm, 1.55*cm, A4[0]-2*cm, 1.55*cm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2*cm, 1.2*cm, 'CCN Digital | Revisão de segurança | 13/11/2026')
    canvas.drawRightString(A4[0]-2*cm, 1.2*cm, str(doc.page))
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=2*cm, leftMargin=2*cm,
                        topMargin=2.2*cm, bottomMargin=2*cm)
width = A4[0]-4*cm
story = [P('Relatório de Auditoria de Segurança — CCN Digital', 'TitleCCN'),
         P('Painel administrativo, API e pacote Debian | 13 de novembro de 2026'),
         P('Branch main; repositório de migração ainda sem commit no início da revisão. Projeto de origem: f97488b.'),
         Spacer(1, 8), P('Veredito pré-envio: COM RESSALVAS', 'HCCN'),
         P('Um achado médio foi confirmado na recuperação do autenticador. A liberação na VM também depende de testes com PostgreSQL, HTTPS, backup e contas reais.'),
         P('Stack detectada', 'HCCN'),
         table([['Camada', 'Tecnologia / controle'],
                ['Painel', 'HTML, CSS e JavaScript; dados exibidos com escape.'],
                ['API', 'Node.js ECMAScript; sessão em cookie HttpOnly e MFA TOTP.'],
                ['Banco', 'PostgreSQL por pg; SQL parametrizado e sem acesso direto do cliente.'],
                ['Infraestrutura', 'Nginx HTTPS, Node em loopback, systemd e ambiente privado.']], [3.2*cm, width-3.2*cm]),
         Spacer(1, 14)]

d = Drawing(width, 95)
d.add(Circle(64, 47, 37, fillColor=colors.white, strokeColor=TEAL, strokeWidth=10))
d.add(String(64, 42, '1', textAnchor='middle', fontName='Helvetica-Bold', fontSize=20, fillColor=NAVY))
d.add(String(130, 68, 'Achados confirmados', fontName='Helvetica-Bold', fontSize=11, fillColor=NAVY))
for i, label in enumerate(['Críticos  0', 'Altos  0', 'Médios  1', 'Baixos  0']):
    d.add(String(130, 49-i*15, label, fontName='Helvetica', fontSize=9, fillColor=NAVY))
story += [d, P('Dependências: npm audit --omit=dev retornou 0 alertas. Testes: 50 passaram; 1 integração PostgreSQL foi ignorada sem banco local.'),
          P('Achado SEC-001 | MÉDIA', 'HCCN'),
          P('Achado inicial: a senha antiga permitia cadastrar outro fator após a redefinição. Corrigido após a auditoria: a senha anterior e sessões são revogadas, e o titular define nova senha por link temporário de uso único antes do novo TOTP. Resta ensaio com PostgreSQL real.'),
          P('Pontos fortes', 'HCCN'),
          P('As rotas administrativas conferem sessão e papel. A redefinição do autenticador exige senha e TOTP de outro administrador, revoga códigos antigos e invalida sessões da conta afetada.'),
          P('O servidor fixa a origem pública e trata o IP encaminhado somente pelo proxy local. As consultas ao banco usam parâmetros; URLs externas e IPs de destino são validados.'),
          PageBreak(), P('Controles revisados', 'TitleCCN')]

controls = [
 ('MFA, papéis e limites', 'Presentes no servidor: TOTP, RBAC, rate limit administrativo e público.'),
 ('HTTPS e origem', 'Modelos presentes. Certificado, DNS, firewall e redirecionamento reais: não verificáveis pelo repositório.'),
 ('Dados e segredos', 'Scrypt, AES-256-GCM e modelo privado de ambiente; nenhum segredo real encontrado no pacote.'),
 ('Logs e backup', 'Atividades registradas; coleta de logs, backup automático e restauração: não verificáveis aqui.'),
 ('Rotas e IDs', 'Operações por ID exigem papel; UUID não substitui autorização.'),
 ('Frontend', 'Sem chave privada; decisões privilegiadas são repetidas na API.'),
 ('RLS', 'Não se aplica: banco não é exposto ao navegador ou aplicativo.'),
 ('Custos e WAF', 'Nenhum serviço pago obrigatório; WAF institucional não verificável.'),
 ('Recuperação de senha', 'Token com hash no banco, uso único e expiração; transporte e logs reais exigem teste.'),
]
story += [table([['Controles (20 itens agrupados)', 'Resultado / evidência']] + [list(x) for x in controls], [5*cm, width-5*cm]),
          P('Práticas verificadas', 'HCCN'),
          table([['Práticas (11 itens agrupados)', 'Resultado'],
                 ['Segredos, API e validação', 'Modelos sem valores; entradas conferidas por tipo, formato e tamanho.'],
                 ['Autorização e ataques comuns', 'Papel no servidor, SQL parametrizado, escape de HTML, proteção de URL/IP e limite de corpo.'],
                 ['Senhas, sessão e logs', 'Scrypt, token de reset temporário, cookie protegido e registro de atividades.'],
                 ['Dependências e transporte', '0 alertas no npm audit; HTTPS real e headers dependem da VM.'],
                 ['Backup e operação', 'Procedimento escrito; implantação e restauração precisam de validação institucional.']], [5*cm, width-5*cm]),
          PageBreak(), P('Prontidão e próximos passos', 'TitleCCN'),
          P('P1. SEC-001 corrigido no código; homologar senha antiga, link reutilizado e sessões antigas com PostgreSQL real.'),
          P('P1. Criar o PostgreSQL, preencher o ambiente privado, validar HTTPS, login, TOTP e Android real na VM.'),
          P('P1. Manter a API anterior atendendo APKs instalados até a mudança de endereço ser distribuída e testada.'),
          P('P2. Programar backup fora da VM, testar restauração e definir responsáveis por logs, disco e certificado.'),
          P('Limites da revisão', 'HCCN'),
          P('Não foi possível verificar o PostgreSQL real, DNS, certificado, SMTP, firewall, backup, VPN, acesso SSH ou contas institucionais. O teste de integração PostgreSQL permanece pendente da VM.'),
          P('Issues para o GitHub', 'HCCN'),
          P('SEC-001: exigir nova senha após recuperação do autenticador. Evidência e critérios de aceite estão na fonte textual deste relatório.'),
          P('Cobertura', 'HCCN'),
          P('A fonte textual completa e o inventário de rotas, arquivos e limites estão nesta pasta. Nenhuma linha do código-fonte foi alterada durante a etapa de auditoria.')]

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
