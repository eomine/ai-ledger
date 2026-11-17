import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import App from './App';

describe('App', () => {
  it('renders an empty chat', async () => {
    const { getByText, getByRole } = await render(<App />);
    await expect
      .element(getByText('Ask a question about your expenses to get started.'))
      .toBeInTheDocument();
    await expect.element(getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });
});
