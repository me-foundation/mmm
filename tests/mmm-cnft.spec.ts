import * as anchor from '@project-serum/anchor';

describe('cnft tests', () => {
  const endpoint = 'http://localhost:8899';
  const conn = new anchor.web3.Connection(endpoint, 'processed');
  it.only('cnft fulfill buy', async () => {
    console.log("cnft fulfill buy!!!!!!!!");
  });
});
