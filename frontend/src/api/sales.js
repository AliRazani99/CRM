import client from './client';

export async function createSale(payload) {
  const response = await client.post(
    '/sales/',
    payload
  );

  return response.data;
}