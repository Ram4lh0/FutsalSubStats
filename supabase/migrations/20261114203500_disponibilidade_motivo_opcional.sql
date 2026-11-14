alter table disponibilidade.respostas drop constraint respostas_check,
  add constraint respostas_motivo_check check (
    motivo is null or (char_length(motivo) <= 500 and estado <> 'vai')
  );
