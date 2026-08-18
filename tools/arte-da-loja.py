"""Gera o ícone da loja (512x512) e o gráfico de destaque (1024x500).

Feitos por código e não à mão porque a marca são quatro valores — o azul do
fundo, o verde, o branco do texto e a proporção do campo — e assim quem os
voltar a gerar daqui a um ano obtém exactamente o mesmo.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BG      = (11, 18, 32)      # --bg
RELVA   = (16, 44, 32)      # o verde escuro do campo, como no ícone que já existe
LINHA   = (34, 197, 94)     # --primary
TEXTO   = (234, 241, 255)   # --text
MUTED   = (145, 164, 196)   # --muted
VERDE_S = (110, 231, 160)   # --green-soft

BOLD  = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
MED   = '/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf'
REG   = '/usr/share/fonts/truetype/google-fonts/Poppins-Regular.ttf'

SS = 4  # desenha-se a 4x e reduz-se: é o que dá as linhas finas sem serrilha


def campo(d, x, y, w, h, traco, cor=LINHA, fundo=RELVA):
    """Um campo de futsal visto de cima: relva, meio-campo e círculo central."""
    r = int(h * 0.06)
    if fundo:
        d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fundo)
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=cor, width=traco)
    cx = x + w // 2
    d.line([cx, y, cx, y + h], fill=cor, width=traco)
    raio = int(h * 0.19)
    cy = y + h // 2
    d.ellipse([cx - raio, cy - raio, cx + raio, cy + raio], outline=cor, width=traco)
    ponto = max(traco, int(h * 0.035))
    d.ellipse([cx - ponto, cy - ponto, cx + ponto, cy + ponto], fill=VERDE_S)


def icone(caminho, lado=512):
    """Quadrado a sangrar, sem cantos redondos e sem transparência.

    A Play Store aplica a máscara dela por cima. Entregar o ícone já
    arredondado fá-lo ser cortado duas vezes, e o resultado são cantos
    estranhos que ninguém sabe explicar.
    """
    L = lado * SS
    im = Image.new('RGB', (L, L), BG)
    d = ImageDraw.Draw(im)
    # O campo ocupa o meio, com margem suficiente para a máscara da loja não
    # lhe comer as linhas.
    w = int(L * 0.68)
    h = int(w * 0.62)
    campo(d, (L - w) // 2, (L - h) // 2, w, h, traco=max(2, int(L * 0.016)))
    im.resize((lado, lado), Image.LANCZOS).save(caminho, 'PNG')
    return caminho


def destaque(caminho, w=1024, h=500):
    """O gráfico do topo da ficha.

    Sem capturas de ecrã: a Google mostra-o cortado e sobreposto por botões em
    vários sítios, e um telemóvel desenhado aqui aparece meio tapado. Nome,
    uma linha, e o campo — que se lê a qualquer tamanho.
    """
    W, H = w * SS, h * SS
    im = Image.new('RGB', (W, H), BG)

    # Um clarão verde do lado direito, atrás do campo.
    #
    # Desfocado a sério, e não só esbatido: sem o desfoque via-se o contorno da
    # elipse como um arco desenhado, que é o oposto do que um clarão deve ser.
    brilho = Image.new('RGB', (W, H), BG)
    bd = ImageDraw.Draw(brilho)
    bd.ellipse([int(W * 0.55), int(-H * 0.5), int(W * 1.2), int(H * 1.5)], fill=(20, 52, 44))
    brilho = brilho.filter(ImageFilter.GaussianBlur(int(W * 0.05)))
    im = Image.blend(im, brilho, 0.75)
    d = ImageDraw.Draw(im)

    # O campo à direita, dentro da margem — a Google corta as bordas em algumas
    # montras, por isso nada de importante encosta ao limite.
    campo_w = int(W * 0.26)
    campo_h = int(campo_w * 0.62)
    campo(d, int(W * 0.66), (H - campo_h) // 2, campo_w, campo_h,
          traco=max(2, int(W * 0.0032)))

    f_nome = ImageFont.truetype(BOLD, int(H * 0.125))
    f_sub  = ImageFont.truetype(MED, int(H * 0.062))

    x = int(W * 0.07)
    # "Futsal" claro e "SubStats" verde, como no site.
    y = int(H * 0.46)
    d.text((x, y), 'Futsal', font=f_nome, fill=TEXTO, anchor='ls')
    largura = d.textlength('Futsal', font=f_nome)
    d.text((x + largura, y), 'SubStats', font=f_nome, fill=LINHA, anchor='ls')

    d.text((x, int(H * 0.60)), 'Cada segundo em campo, contado',
           font=f_sub, fill=MUTED, anchor='ls')

    im.resize((w, h), Image.LANCZOS).save(caminho, 'PNG')
    return caminho


if __name__ == '__main__':
    base = 'metadata/play/'
    print(icone(base + 'icone-512.png'))
    print(destaque(base + 'destaque-1024x500.png'))
