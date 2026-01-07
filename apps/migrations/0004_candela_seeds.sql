PRAGMA foreign_keys = ON;

-- Papéis
INSERT INTO candela_role (name, description) VALUES
('SOCIÁVEL','Como orador, coração ou membro carismático do grupo, um personagem Sociável costuma ser confiante e ter habilidades motivacionais, de atuação ou de persuasão.'),
('FORTE','Como membro protetor, lutador ou ousado do grupo, um personagem Forte costuma ser um indivíduo corajoso que domina combate, estratégias ou atividades físicas.'),
('ESTUDIOSO','Como membro racional ou intelectual do grupo, um personagem Estudioso costuma ser um indivíduo culto com habilidade em estudo, pensamento crítico ou atividades técnicas.'),
('FURTIVO','Como membro malandro, ladino ou perverso do grupo, um personagem Furtivo costuma ser um indivíduo subversivo e esperto com habilidades criminais, clandestinas ou do submundo.'),
('ESTRANHO','Como membro arcano, mágicko ou sobrenatural do grupo, um personagem Estranho costuma ter ligações com o ocultismo e tem habilidades psíquicas, saberes enigmáticos e compreensão sobre os desbastes.');

-- Especialidades (com vínculo ao Papel + descrição + imagem)
INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Jornalista',
'Jornalista: você é um investigador ousado que sabe chegar à origem dos fatos. Sua principal motivação é Astúcia e suas habilidades são focadas em coletar e avaliar informações.',
'candela/specialties/jornalista.png'
FROM candela_role r WHERE r.name='SOCIÁVEL';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Mágico',
'Mágico: você sabe entreter e criar distrações e ilusões. Sua principal motivação é Intuição e suas habilidades são focadas em executar e detectar truques.',
'candela/specialties/magico.png'
FROM candela_role r WHERE r.name='SOCIÁVEL';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Explorador',
'Explorador: você é uma pessoa destemida que sabe navegar por ambientes difíceis e perigosos. Sua principal motivação é Vigor e suas habilidades são focadas em resistência e confrontar o perigo.',
'candela/specialties/explorador.png'
FROM candela_role r WHERE r.name='FORTE';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Soldado',
'Soldado: você tem treinamento de combate e sabe tomar decisões táticas. Sua principal motivação é Intuição e suas habilidades são focadas em estratégia de combate e disciplina.',
'candela/specialties/soldado.png'
FROM candela_role r WHERE r.name='FORTE';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Médico',
'Médico: você é um profissional habilidoso que sabe conduzir procedimentos médicos. Sua principal motivação é Intuição e suas habilidades são focadas em anatomia e cura.',
'candela/specialties/medico.png'
FROM candela_role r WHERE r.name='ESTUDIOSO';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Professor',
'Professor: você é um profissional acadêmico que sabe muito sobre seu campo de estudo escolhido. Sua principal motivação é Astúcia e suas habilidades são focadas em pensamento crítico e fazer uso de sua experiência.',
'candela/specialties/professor.png'
FROM candela_role r WHERE r.name='ESTUDIOSO';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Criminoso',
'Criminoso: você é um fora da lei de grandes feitos que sabe operar no mundo do crime. Sua principal motivação é Astúcia e suas habilidades são focadas em conexões da rua e atividades nefastas.',
'candela/specialties/criminoso.png'
FROM candela_role r WHERE r.name='FURTIVO';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Detetive',
'Detetive: você é um investigador experiente que tem uma visão de fora sobre o funcionamento do mundo do crime. Sua principal motivação é Vigor e suas habilidades são focadas em descobrir a verdade e deter malfeitores.',
'candela/specialties/detetive.png'
FROM candela_role r WHERE r.name='FURTIVO';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Médium',
'Médium: você é um vidente adepto que sabe como se comunicar com o outro mundo. Sua principal motivação é Intuição e suas habilidades são focadas em adivinhação e criar vínculos com espíritos.',
'candela/specialties/medium.png'
FROM candela_role r WHERE r.name='ESTRANHO';

INSERT INTO candela_specialty (role_id, name, description, image_storage_key)
SELECT r.id, 'Ocultista',
'Ocultista: você é um praticante das artes místicas com conhecimento avançadíssimo do sobrenatural. Sua principal motivação é Intuição e suas habilidades são focadas em rituais e conhecimentos arcanos.',
'candela/specialties/ocultista.png'
FROM candela_role r WHERE r.name='ESTRANHO';

-- Defaults de ações por Especialidade
-- Jornalista: Ler 1, Avaliar 2, Focar 1, Sentir 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'LER', 1 FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 2 FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'SENTIR', 1 FROM candela_specialty s WHERE s.name='Jornalista';

-- Mágico: Influenciar 2, Ler 1, Esconder 1, Focar 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'INFLUENCIAR', 2 FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'LER', 1 FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'ESCONDER', 1 FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Mágico';

-- Explorador: Mover 1, Atacar 2, Avaliar 1, Focar 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'MOVER', 1 FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'ATACAR', 2 FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 1 FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Explorador';

-- Soldado: Mover 2, Atacar 2, Controlar 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'MOVER', 2 FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'ATACAR', 2 FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'CONTROLAR', 1 FROM candela_specialty s WHERE s.name='Soldado';

-- Médico: Controlar 1, Ler 1, Avaliar 1, Focar 2
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'CONTROLAR', 1 FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'LER', 1 FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 1 FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 2 FROM candela_specialty s WHERE s.name='Médico';

-- Professor: Influenciar 1, Avaliar 2, Focar 2
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'INFLUENCIAR', 1 FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 2 FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 2 FROM candela_specialty s WHERE s.name='Professor';

-- Criminoso: Controlar 1, Esconder 2, Avaliar 1, Focar 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'CONTROLAR', 1 FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'ESCONDER', 2 FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 1 FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Criminoso';

-- Detetive: Controlar 1, Esconder 1, Avaliar 2, Focar 1
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'CONTROLAR', 1 FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'ESCONDER', 1 FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 2 FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Detetive';

-- Médium: Ler 2, Avaliar 1, Sentir 2
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'LER', 2 FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'AVALIAR', 1 FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'SENTIR', 2 FROM candela_specialty s WHERE s.name='Médium';

-- Ocultista: Controlar 1, Ler 1, Focar 1, Sentir 2
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'CONTROLAR', 1 FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'LER', 1 FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'FOCAR', 1 FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_specialty_action_default (specialty_id, action_key, rating)
SELECT s.id, 'SENTIR', 2 FROM candela_specialty s WHERE s.name='Ocultista';

-- 0004: ADICIONE (depois de inserir candela_specialty)
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',3 FROM candela_specialty WHERE name='Jornalista';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',1 FROM candela_specialty WHERE name='Mágico';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',2 FROM candela_specialty WHERE name='Mágico';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'VIGOR',3 FROM candela_specialty WHERE name='Explorador';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'VIGOR',1 FROM candela_specialty WHERE name='Soldado';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',2 FROM candela_specialty WHERE name='Soldado';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',3 FROM candela_specialty WHERE name='Médico';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',2 FROM candela_specialty WHERE name='Professor';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',1 FROM candela_specialty WHERE name='Professor';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'VIGOR',1 FROM candela_specialty WHERE name='Criminoso';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',2 FROM candela_specialty WHERE name='Criminoso';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'VIGOR',2 FROM candela_specialty WHERE name='Detetive';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',1 FROM candela_specialty WHERE name='Detetive';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'ASTUCIA',1 FROM candela_specialty WHERE name='Médium';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',2 FROM candela_specialty WHERE name='Médium';
INSERT INTO candela_specialty_group_default (specialty_id, group_key, drive_default)
SELECT id,'INTUICAO',3 FROM candela_specialty WHERE name='Ocultista';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Jornalista')
  AND action_key = 'AVALIAR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Mágico')
  AND action_key = 'INFLUENCIAR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Explorador')
  AND action_key = 'MOVER';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Soldado')
  AND action_key = 'ATACAR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Médico')
  AND action_key = 'LER';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Professor')
  AND action_key = 'FOCAR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Criminoso')
  AND action_key = 'ESCONDER';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Detetive')
  AND action_key = 'CONTROLAR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Médium')
  AND action_key = 'SENTIR';

UPDATE candela_specialty_action_default
SET gilded_default = 1
WHERE specialty_id = (SELECT id FROM candela_specialty WHERE name='Ocultista')
  AND action_key = 'FOCAR';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Conheço um Cara','Uma vez por tarefa, pergunte ao mestre quem nos arredores pode ajudar você. Ele explicará quem é o NPC e por que ele pode ter informações úteis para a investigação.','ROLE', r.id FROM candela_role r WHERE r.name='SOCIÁVEL';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Lábia','Você sabe controlar a conversa. Após falar brevemente com alguém, você pode adicionar +1d a rolagens de Ler com aquela pessoa como alvo. Se a sua resistência de Astúcia for igual ou superior a 2, o dado é dourado.','ROLE', r.id FROM candela_role r WHERE r.name='SOCIÁVEL';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Calma sob Pressão','Em rolagens de risco alto, você sempre pode gastar Astúcia em vez da motivação correspondente à ação.','ROLE', r.id FROM candela_role r WHERE r.name='SOCIÁVEL';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Atrás de Mim','Gaste 1 Vigor para escolher um aliado na mesma cena que esteja prestes a sofrer uma marca de um fenômeno e depois descreva o que você faz para sofrer a marca em seu lugar.','ROLE', r.id FROM candela_role r WHERE r.name='FORTE';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Surto de Adrenalina','Para cada marca que sofrer, você pode recuperar um ponto de motivação à sua escolha imediatamente.','ROLE', r.id FROM candela_role r WHERE r.name='FORTE';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Robustez','Ao sofrer marcas suficientes para ficar incapacitado, em vez disso, role um número de d6 igual à sua resistência de Vigor atual. Tirando 6, você não fica incapacitado e não sofre uma cicatriz.','ROLE', r.id FROM candela_role r WHERE r.name='FORTE';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Leitor Ávido','Você estudou muito e retém conhecimento melhor que muitas pessoas. Quando gastar Intuição ao fazer uma rolagem, se tirar 3 ou menos, recupere a Intuição gasta.','ROLE', r.id FROM candela_role r WHERE r.name='ESTUDIOSO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Pesquisador do Oculto','Sofra 1 marca da Mente para perguntar ao mestre sobre um detalhe de ocultismo importante que você reconheceria de seus estudos e que ainda não foi revelado na cena. Se não houver detalhes, apague a marca da Mente.','ROLE', r.id FROM candela_role r WHERE r.name='ESTUDIOSO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Notas Meticulosas','Se a sua resistência de Astúcia for igual ou superior a 2, adicione +1d a todas as rolagens de Focar. Depois de uma tarefa, aumente seu contador de iluminação em 1 ponto, devido às notas detalhadas do seu personagem.','ROLE', r.id FROM candela_role r WHERE r.name='ESTUDIOSO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Batedor','Se tiver tempo de observar um local, você pode gastar 1 Intuição para fazer uma pergunta ao mestre sobre o que percebe ali que os outros não veem, o que pode ser útil ou que caminho seguir.','ROLE', r.id FROM candela_role r WHERE r.name='FURTIVO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Eu Já Sabia','Três vezes por tarefa, você pode adicionar +1d à rolagem de um membro do círculo sem gastar motivação, descrevendo como vocês se prepararam juntos para tal situação.','ROLE', r.id FROM candela_role r WHERE r.name='FURTIVO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Desafio à Morte','Uma vez por tarefa, quando fosse sofrer uma ou mais marcas causadas por um inimigo, você escapa sem se ferir. Descreva como seu pensamento rápido salvou sua pele.','ROLE', r.id FROM candela_role r WHERE r.name='FURTIVO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Escudos Grandiosos','Você pode inscrever e manter um símbolo protetor em uma pessoa por vez. Ela ganha +1d em rolagens de Mover contra fenômenos.','ROLE', r.id FROM candela_role r WHERE r.name='ESTRANHO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Deixe que Venham','Toda vez que sofrer uma ou mais marcas da Sangria, você pode obter mais informações sobre o fenômeno que lhe causou mal, fazendo uma pergunta ao mestre.','ROLE', r.id FROM candela_role r WHERE r.name='ESTRANHO';

INSERT INTO candela_ability (name, description, scope, role_id)
SELECT 'Ritual','Quando tiver alguns minutos para se preparar, você pode sofrer uma marca da Sangria para executar um ritual em você ou em um aliado, como Círculo de Proteção, Revigorar ou Visão Remota.','ROLE', r.id FROM candela_role r WHERE r.name='ESTRANHO';

-- Especialidade: Jornalista (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Acesso Interno','Seu ramo de atuação oferece privilégios. Uma vez por tarefa, você ganha acesso automático a uma pessoa ou lugar importante usando o equipamento credencial de imprensa.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Livro Aberto','Você faz as pessoas se abrirem muito rápido. Quando tentar se conectar com outras pessoas compartilhando algo muito pessoal, adicione um número de dados igual à sua resistência de Astúcia atual a uma rolagem de Influenciar. Com um sucesso, a pessoa retribuirá.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Detector de Mentiras','Ao rolar Ler para descobrir se uma pessoa está contando a verdade, torne dourado mais um dado. A primeira Astúcia que você gastar na rolagem valerá +2d em vez de +1d.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Conferência de Imprensa','Você pode gastar 1 Astúcia para reunir um grande grupo de pessoas e proferir anúncios, fazer perguntas ou criar uma distração. Todas as rolagens de Astúcia que você fizer nesta reunião têm +1d.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Nas Trincheiras','Você já atuou várias vezes em jornalismo de risco e sabe se cuidar. Uma vez por tarefa, você pode apagar 1 resistência de Astúcia para absorver uma marca do Corpo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Pesquisa Bem-feita','Você pode gastar 1 Intuição para fazer uma pergunta específica ao mestre sobre um lugar, grupo ou conceito que pesquisou antes da tarefa. Ele contará o que você sabe devido a essa preparação.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Jornalista';

-- Especialidade: Mágico (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Ludibriar','Ao usar palavras ou ações para distrair um alvo daquilo que está acontecendo de verdade, role Esconder. A primeira Astúcia que você ou um aliado gastar nesta rolagem vale +2d em vez de +1d.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Escapista','Gaste 1 Vigor para escapar imediatamente de cordas, algemas, grilhões ou de uma criatura que agarrou você.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Padrão Praticado','Você ensaiou muito para um momento como este. Ao rolar Influenciar ou Esconder, você pode gastar Intuição em vez de Astúcia.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Percepção Anormal','Você pode gastar 1 Intuição para fazer uma pergunta ao mestre: o que posso aproveitar daqui para ter uma vantagem? O que, aqui, não funciona do jeito que aparenta? O que, aqui, está fora do lugar?','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Prosperar','Você sabe encobrir seus erros com talento. Em uma rolagem na qual poderia gastar Astúcia, em uma falha ou um sucesso misto, você pode gastar 2 Astúcia para subir o resultado em um patamar, de falha a sucesso misto ou de sucesso misto a sucesso completo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'O Grande Truque','Suas mágicas costumam ser truques baratos, mas você aprendeu um que é verdadeiro. Role Sentir quando realizá-lo — se passar, sofra uma marca da Sangria. Circule uma opção ao escolher esta habilidade: mudar aparência, levitar, invocar objeto mundano, teletransportar a uma distância curta ou projetar a voz.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Mágico';

-- Especialidade: Explorador (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Léxico Obscuro','Ao encontrar uma linguagem antiga ou esotérica, você pode gastar 1 Intuição para entender o que ela diz.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Experiência de Campo','Você viajou pelo mundo e já esteve em muitas situações de perigo. Uma vez por tarefa, descreva ao grupo como uma aventura anterior é parecida com a situação atual e recupere 1 Vigor para todos de seu círculo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Mente Aguçada','Quando tiver que usar uma ação específica para rolar, você também poderá sofrer uma marca da Mente para utilizar outra ação. Você também pode gastar a motivação correspondente à ação escolhida. Descreva como você se adapta à situação.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Persistente','Quando você tiver 1 ou mais marcas da Sangria, torne dourado mais um dado em rolagens de Mover, Atacar e Controlar enquanto em perigo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Escapar por Pouco','Você já esteve em várias situações arriscadas durante suas desventuras. Adicione +1d à sua rolagem de Mover quando tentar escapar de uma armadilha ou emboscada.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'De Novo Não','Uma vez por tarefa, você pode sofrer uma cicatriz para ter sucesso completo automático em uma ação. Se fizer isso, é como se você tivesse a cicatriz desde sempre — conte ao círculo como a conseguiu e por que a lição aprendida está ajudando você a ter sucesso aqui. Não ajuste seus valores de ação ao sofrer essa cicatriz.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Explorador';

-- Especialidade: Soldado (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Treinamento Básico','Você tem experiência tática em situações de estresse alto. Ao rolar Avaliar em um lugar perigoso, adicione um número de dados igual à sua resistência de Vigor atual.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Equipado','Você e um aliado do círculo podem marcar um espaço de equipamento a mais em cada tarefa.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Atirador de Elite','Quando fizer um ataque à distância com uma arma, você pode gastar 1 Vigor para firmar a mira antes de atirar, adicionando +2d ao seu próximo tiro contra este alvo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Estrategista','Em uma situação de perigo, você pode gastar 1 Vigor para fazer uma pergunta ao mestre: como chegar a um lugar seguro? Qual é a maior ameaça imediata ao meu círculo? Para onde o alvo vai em seguida?','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Compartimentalização','Você treinou para se desassociar dos horrores da violência. Uma vez por tarefa, você pode apagar 1 resistência de Vigor para absorver uma marca da Mente.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Trabalho Voluntário','Entre tarefas, em vez de gastar recursos, você pode oferecer ajuda ao seu guardião da luz. Descreva como vai ajudar a organização e recupere 1 ponto de qualquer recurso da Candela Obscura em sua ficha de círculo. Você não pode gastar recursos durante este tempo livre.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Soldado';

-- Especialidade: Médico (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Tratar Ferimentos','Se estiver em um momento calmo, você pode rolar Focar para curar 1 marca do Corpo de um aliado. Se tirar 4 ou 5, gaste 2 Intuição para realizar isso. Se tirar 6, gaste 1 Intuição. Se tirar 3 ou menos, você pode sofrer uma marca da Mente para usar o resultado 4 ou 5.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Não Combatente','Sua dor instiga as outras pessoas a agirem. Se você ainda não feriu ninguém nesta tarefa, ao sofrer uma marca, cada um de seus aliados na cena pode recuperar 1 ponto de motivação à escolha deles.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Dissecação','Ao rolar Focar para dissecar matéria orgânica afetada pela sangria, torne dourado mais um dado. Você não pode sofrer marcas da Sangria desta inspeção.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Reanimação','Quando um aliado próximo sofre uma cicatriz, você pode rolar Focar para tentar reanimá-lo imediatamente. Se tirar 6, você consegue. Embora ainda vá sofrer a cicatriz, o aliado fica de pé. Se tirar 4 ou 5, isso custará 3 pontos de motivação à sua escolha. Não será possível reanimar quando um PJ sofrer sua quarta cicatriz.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Cuidados Médicos','Entre tarefas, você pode gastar 1 Curar para tratar a cicatriz de um aliado. Quando fizer isso, role Focar. Se for um sucesso crítico, preencha três. Se tirar 6, preencha duas. Se tirar 4 ou 5, preencha uma. Quando o contador estiver cheio, a cicatriz é curada e 1 ponto de ação pode ser trocado.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Golpe Anatômico','Você sabe qual é a parte mais vulnerável do corpo. Quando atacar um inimigo, você pode rolar Focar em vez de Atacar.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médico';

-- Especialidade: Professor (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Mente de Aço','Uma vez por tarefa, quando fosse sofrer uma marca da Mente, você pode apagar 1 resistência de Intuição para absorvê-la.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Recursos da Universidade','Sua universidade tem alunos no mundo inteiro. Uma vez por sessão, descreva uma pessoa que você conhece do seu tempo como professor e pergunte ao mestre onde encontrá-la nas cercanias.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Aprender com Meus Erros','Toda vez que você tirar 3 ou menos em uma rolagem, descreva que lição aprendeu desta falha e recupere 1 ponto de motivação à sua escolha.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Segurança é Prioridade','Ao rolar Controlar ou Mover para fugir do perigo, torne dourado um dado. Nesta rolagem, o primeiro Vigor que você gastar vale +2d em vez de +1d.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Eloquente','Ao fazer um discurso ou manter uma conversa para ajudar um aliado, o dado que você concede a ele é dourado.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Mistura Química','Você sabe misturar produtos químicos para obter efeitos específicos. Quando escolher o equipamento laboratorial, você pode passar alguns minutos produzindo uma mistura que é: ácida, explosiva, inflamável, barulhenta, sonífera, pegajosa ou tóxica.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Professor';

-- Especialidade: Criminoso (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Malandragem de Rua','Você sabe ficar de olho em seus arredores. Toda vez que rolar Avaliar, você pode gastar qualquer motivação em vez de apenas Intuição.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Aproveitar','Se rolar Ler com sucesso, você pode perguntar ao mestre o que seu alvo quer de verdade. Adicione um número de dados igual à sua resistência de Astúcia atual às rolagens de Influenciar que você fizer usando esta informação.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Casca-grossa','Ao sofrer uma cicatriz, você pode optar por não mudar pontos de ação como resultado.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Nascido nas Sombras','Quando estiver evitando seguranças ou detecções, torne dourado mais um dado de Esconder.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Manhas do Ofício','Você aprendeu a resolver situações complicadas ou perigosas para não se colocar em apuros. Você pode gastar 1 Vigor para reduzir o risco antes de rolar Esconder ou Influenciar. Se a rolagem já for de baixo risco, você não pode usar esta habilidade.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Dedos Pegajosos','Após um sucesso em um ataque corpo a corpo, você pode gastar 1 Astúcia para furtar um item do alvo sem ele notar. Pode ser uma carteira, uma arma, um documento importante etc.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Criminoso';

-- Especialidade: Detetive (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Palácio Mental','Quando você quiser descobrir como duas pistas se relacionam ou o caminho ao qual elas apontam, apague 1 resistência de Intuição. O mestre contará que informações você deduziu.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Interrogatório','Quando estiver fazendo perguntas a uma pessoa relutante em fornecer informações, adicione um número de dados igual à sua resistência de Astúcia atual à sua rolagem de Ler.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Contra a Parede','Quando fizer uma rolagem de risco alto, você pode sofrer uma marca da Mente para fazer seu Vigor gasto valer +2d em vez de +1d.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Inspeção','Você tem experiência em examinar cenas de crimes. Quando rolar Avaliar para coletar evidências sobre o que pode ter ocorrido em um local, torne dourado mais um dado desta rolagem.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Tocaia','Você sabe obter informações sem que detectem sua presença. Quando estiver seguindo um suspeito ou fazendo vigilância, você pode usar Avaliar em vez de Esconder.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Um Passo à Frente','Uma vez por tarefa, você pode apresentar um objeto mundano e útil que levava consigo desde o início. Quando fizer isso, marque o espaço de equipamento vazio e anote o objeto nesta seção. O objeto não é contado no seu limite de equipamentos.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Detetive';

-- Especialidade: Médium (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Miasma','Você pode gastar 1 Intuição para entender se e como uma pessoa ou objeto foi afetado pela sangria.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Entortar Colheres','Você pode rolar Sentir para controlar, usando a mente, um objeto no cômodo em que está para: ligar um interruptor, derrubar algo, mover um objeto pequeno, desligar uma luz etc. Em um sucesso misto, você pode sofrer uma marca da Sangria para tornar a rolagem um sucesso completo.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Leitura Fria','Em um sucesso em uma rolagem de Sentir, você entende por qual doença, estresse ou perda uma pessoa passou na vida, mesmo que ela esteja tentando escondê-la.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Premonições','Você tem visões do futuro. Quando um aliado estiver prestes a sofrer 1 ou mais marcas, apague uma resistência de Intuição para avisá-lo do perigo vindouro. Em seguida, absorva uma dessas marcas.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Momentos Finais','Ao tocar em um cadáver, você pode apagar uma resistência de Intuição para ouvir, cheirar e sentir os últimos momentos da vida daquela criatura. Escolhendo sofrer uma marca da Sangria, você pode ir além e ver uma imagem da última coisa que ela viu antes da morte.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Comungar','Você pode se conectar com um fenômeno senciente próximo para se comunicar com ele. Sofra uma marca da Mente e role Sentir para estabelecer um vínculo empático ou telepático e fazer uma pergunta. Em um sucesso, você consegue uma resposta. Se tirar 4 ou 5, o fenômeno fará uma pergunta de volta.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Médium';

-- Especialidade: Ocultista (6)
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Lâmina Fantasma','Você pode se sintonizar com uma faca ritualística. Se banhá-la em seu sangue (sofra uma marca do Corpo), ela se torna bastante efetiva contra seres mágickos e pode atingir inimigos invisíveis ou etéreos.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Sangue do Pacto','Na primeira vez que um fenômeno perigoso causa uma marca em alguém do círculo, você recupera um número de pontos, de qualquer motivação, igual à sua resistência de Intuição atual.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Falar a Língua Deles','Você sabe falar a linguagem sobrenatural de qualquer fenômeno que encontrar. Descreva de que maneira estranha ou aterrorizante vocês se comunicam.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Bancar a Isca','Você sabe chamar a atenção de um fenômeno — é só se colocar de isca. Role Sentir para atrair um fenômeno próximo para sua direção.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Estender Seus Sentidos','Ao rolar Sentir para entender mais sobre um fenômeno que você encontrou, adicione à rolagem um número de dados igual à sua resistência de Intuição atual.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';
INSERT INTO candela_ability (name, description, scope, specialty_id) SELECT 'Ritual Proibido','Você conhece um ritual muito complexo ou extremamente perigoso que terá um resultado desejado. Ao usá-lo, você sofre uma cicatriz da Sangria imediatamente. Determine o tipo de ritual e seus efeitos: mudar o ambiente, conjurar um fenômeno ou salvar uma pessoa moribunda.','SPECIALTY', s.id FROM candela_specialty s WHERE s.name='Ocultista';

