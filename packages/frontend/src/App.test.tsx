import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import App from './App';

describe('App', () => {
  it('renders', async () => {
    const { getByText } = await render(<App />);
    await expect
      .element(getByText('How much did I spend on groceries last month?'))
      .toBeInTheDocument();
  });
});
