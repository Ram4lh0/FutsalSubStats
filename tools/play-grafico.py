#!/usr/bin/env python3
"""tools/play-grafico.py — o gráfico de destaque da Play Store.

A Google pede uma imagem de 1024 × 500 no topo da ficha da app. A Apple não pede
nada disto, por isso é o único material gráfico que não se reaproveita do que já
estava feito.

Duas regras da Google que se percebem tarde e custam uma submissão:

  1. **Sem capturas de ecrã lá dentro.** São recusados gráficos de destaque que
     sejam colagens de ecrãs da app — já há uma fila de capturas por baixo, e
     esta imagem serve para dizer o que a app é, não para a mostrar.
  2. **Nada de importante nas bordas.** A imagem é cortada de maneiras
     diferentes conforme o sítio onde aparece. O que interessa fica no meio.

Porquê Python e não Node, como o `android-icones.mjs`: o motor de SVG que vem
com o `sharp` foi compilado sem suporte a texto. Desenhar o campo funcionava,
mas o título e a frase saíam invisíveis — e uma imagem que parece bem no código
e sai vazia é o pior tipo de erro. O PIL escreve o texto com o ficheiro do tipo
de letra na mão, e não há nada a adivinhar.

Os PNG ficam no repositório, por isso isto não é preciso correr outra vez a não
ser que a frase mude.

    python3 tools/play-grafico.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'metadata' / 'play'

L, A = 1024, 500

FUNDO = (11, 18, 32)
FUNDO2 = (17, 28, 48)
RELVA = (18, 51, 31)
LINHA = (34, 197, 94)
BOLA = (232, 253, 240)
TEXTO = (234, 241, 255)
SUAVE = (145, 164, 196)

FONTES = '/usr/share/fonts/truetype/google-fonts'
NEGRITO = f'{FONTES}/Poppins-Bold.ttf'
MEDIO = f'{FONTES}/Poppins-Medium.ttf'
NORMAL = f'{FONTES}/Poppins-Regular.ttf'

TEXTOS = {
    'pt': ('FutsalSubStats', 'Tempo de jogo, ao segundo',
           'futsal · substituições · estatísticas'),
    'en': ('FutsalSubStats', 'Time on court, to the second',
           'futsal · substitutions · statistics'),
    'es': ('FutsalSubStats', 'Tiempo de juego, al segundo',
           'fútbol sala · cambios · estadísticas'),
}


def fundo():
    """Degradê na diagonal. Um retângulo liso a esta escala parece um erro."""
    img = Image.new('RGB', (L, A), FUNDO)
    d = ImageDraw.Draw(img)
    for i in range(A):
        t = i / A
        cor = tuple(int(FUNDO[c] + (FUNDO2[c] - FUNDO[c]) * t) for c in range(3))
        d.line([(0, i), (L, i)], fill=cor)
    return img


def campo(d, x, y, larg):
    """O mesmo campo do ícone, para as duas imagens se reconhecerem."""
    alt = larg * 0.78
    traco = max(2, int(larg * 0.03))
    cx, cy = x + larg / 2, y + alt / 2
    d.rounded_rectangle([x, y, x + larg, y + alt], radius=int(larg * 0.04),
                        fill=RELVA, outline=LINHA, width=traco)
    d.line([(cx, y), (cx, y + alt)], fill=LINHA, width=traco)
    r = alt * 0.21
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=LINHA, width=traco)
    rb = alt * 0.08
    d.ellipse([cx - rb, cy - rb, cx + rb, cy + rb], fill=BOLA)


# A Play recorta as margens deste gráfico em alguns sítios da loja — nas listas
# horizontais, sobretudo. O que estiver encostado à borda desaparece.
MARGEM_DIREITA = 60


def cabe(d, texto, ficheiro, tamanho, x):
    """A maior letra com que `texto` ainda cabe entre `x` e a margem direita.

    Os tamanhos estavam escritos à mão, e estavam certos para o nome de então.
    Bastou trocar "Futsal ao Vivo" por "FutsalSubStats" — quatro letras a mais —
    para o título passar a acabar a 29 px da borda. Ninguém teria reparado até
    ver a ficha cortada no telemóvel de outra pessoa.

    Encolher é sempre melhor do que cortar: o pior que acontece é o título ficar
    um pouco mais pequeno, e isso não se nota sem os dois lado a lado.
    """
    largura_max = L - x - MARGEM_DIREITA
    while tamanho > 8:
        fonte = ImageFont.truetype(ficheiro, tamanho)
        if d.textlength(texto, font=fonte) <= largura_max:
            return fonte
        tamanho -= 1
    return ImageFont.truetype(ficheiro, 8)


def grafico(titulo, frase, rodape):
    img = fundo()
    d = ImageDraw.Draw(img)

    # Linhas de campo esbatidas à direita, só para a imagem não ser lisa.
    # Discretas de propósito: o assunto é o texto.
    ghost = Image.new('RGBA', (L, A), (0, 0, 0, 0))
    g = ImageDraw.Draw(ghost)
    cx = L - 120
    g.ellipse([cx - 210, A / 2 - 210, cx + 210, A / 2 + 210],
              outline=LINHA + (46,), width=3)
    g.line([(cx, 0), (cx, A)], fill=LINHA + (46,), width=3)
    img = Image.alpha_composite(img.convert('RGBA'), ghost).convert('RGB')
    d = ImageDraw.Draw(img)

    campo_larg = 300
    campo_alt = campo_larg * 0.78
    campo(d, 92, (A - campo_alt) / 2, campo_larg)

    x = 92 + campo_larg + 76
    d.text((x, 168), titulo, font=cabe(d, titulo, NEGRITO, 68, x), fill=TEXTO)
    d.text((x, 252), frase, font=cabe(d, frase, MEDIO, 32, x), fill=LINHA)
    d.text((x, 305), rodape, font=cabe(d, rodape, NORMAL, 23, x), fill=SUAVE)
    return img


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    for codigo, (titulo, frase, rodape) in TEXTOS.items():
        grafico(titulo, frase, rodape).save(SAIDA / f'feature-graphic-{codigo}.png')
    print(f'✓ Play: {len(TEXTOS)} gráficos de destaque 1024×500 em metadata/play/')


if __name__ == '__main__':
    main()
