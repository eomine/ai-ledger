import { CATEGORIES } from '@ai-ledger/schema/categories';

function App() {
  return (
    <section>
      <h1>Hello World!</h1>
      <ul>
        {CATEGORIES.map((category) => (
          <li key={category}>{category}</li>
        ))}
      </ul>
    </section>
  );
}

export default App;
