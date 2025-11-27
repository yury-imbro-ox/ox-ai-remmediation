import axios from 'axios';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import bodyParser from 'body-parser';
import {recuperarDadosPessoaEspecifica, extrairInformacoesParaRecuperarPessoaEspecifica} from '../backend/webscrappingMethods.js'
import {calcularNumeroUSP} from '../backend/segredo.js'


const urlBaseBuscaPessoas = 'https://www.icmc.usp.br/templates/icmc2015/php/pessoas.php'
const urlBasePessoaEspecifica = 'https://www.icmc.usp.br/pessoas'

const app = express();

app.use((req, res, next) => {
  console.log('Requisição:', req.method, req.originalUrl);
  next();
});

// Middleware de CORS
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  next();
});

// Configurar o proxy reverso
app.use('/api/pessoas', createProxyMiddleware({
  target: urlBaseBuscaPessoas,
  changeOrigin: true,
  pathRewrite: {
    '^/api/pessoas': '' // Remove o prefixo '/api/pessoas' da URL
  }
}));


app.use(bodyParser.json()); // Faz o parse do corpo das solicitações JSON


// Mapeamento do post /pessoas que requisita o pessoas do ICMC e chama os métodos de webscrapping
app.post('/pessoas', async (req, res) => {

  let nome = decodeURIComponent(req.body.nome);
  const grupo = '';
  const depto = '';
  const pagina = '1';
  const titulo = '';
  console.log('Nome:', nome);
  try {
    const response = await axios.post(urlBaseBuscaPessoas, {
      grupo,
      depto,
      nome,
      pagina,
      titulo
    }, 
    {
      method: 'POST', // Especifica o método HTTP como POST
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded' // Define o cabeçalho Content-Type corretamente
      },
      timeout: 10000,
      withCredentials: true,
      cookie: { httpOnly: false }
    },
      
    );
    
    var {idPessoa, urlFoto} = extrairInformacoesParaRecuperarPessoaEspecifica(response.data);

    if(idPessoa == -1) { 
      res.send({curriculoLattes:-1, descricaoGeralICMC:-1, email:-1, idPessoa:-1, nUSP:-1, paginaPessoal:-1, papelNoICMC:-1, researcherIDNumber:-1, researcherIDUrl:-1, urlFoto:-1, telefone:-1})
      console.log('Nenhuma requisição de informação extra foi bem sucedida. Provavelmente esta pessoa não está na base do ICMC.')
      return {};
    }

    let email = -1;
    email = await recuperarEmailDosHeaders(idPessoa);
 
    try {

      var dadosExtrasFinais = await recuperarDadosExtrasFinais(idPessoa)
      dadosExtrasFinais.idPessoa = idPessoa;
      dadosExtrasFinais.email = email;
      dadosExtrasFinais.urlFoto = urlFoto;
      dadosExtrasFinais.nUSP = calcularNumeroUSP(dadosExtrasFinais);
      console.log(dadosExtrasFinais)
      res.send(dadosExtrasFinais)
    
    }catch(error) {
      console.error(error)
    }    

  } catch (error) { 
    console.error(error)
    res.status(500).json({ error: 'Erro ao fazer a requisição.' });
  }

});

async function recuperarDadosExtrasFinais(id) {
  const response = await axios.get(urlBasePessoaEspecifica, {
    params: { id }, // Adicione o parâmetro "id" aos query parameters
    timeout: 10000
  });
  
  return( recuperarDadosPessoaEspecifica(response.data.toString()))
}

app.listen(4000, () => {
  console.log('Servidor rodando na porta 4000');
});


async function recuperarEmailDosHeaders(idPessoa) {
  try {
    const response = await axios.get('https://www.icmc.usp.br/pessoas?id='+idPessoa);
    const headers = response.headers['set-cookie'].join('_');
    let possuiEmail = headers.indexOf('imgMail=') !== -1;
    if(!possuiEmail){ return -1; }

    let inicioEmail = headers.slice(headers.indexOf('imgMail=')+8);
    let email = inicioEmail.slice(0, inicioEmail.indexOf(';'))

    return email.replace('%40', '@');
  } catch (error) {
    console.error(error);
  }
}
