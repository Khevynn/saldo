# Regras do repositório

## Dados de produção

- Trate o banco e os volumes atuais como dados reais de clientes.
- Nunca apague ou recrie banco, schema, tabela, coluna ou volume com dados existentes.
- Nunca execute migrations destrutivas, resets, truncates ou comandos equivalentes.
- Mudanças de schema devem ser aditivas, retrocompatíveis e preservar integralmente os dados atuais.
- Antes de qualquer migration em produção, gere um backup recuperável e valide a mudança sem perda de dados.
- Se uma mudança puder causar perda, corrupção ou reinterpretação irreversível de dados, pare e peça autorização explícita.
