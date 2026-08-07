import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children}</div>,
  Route: ({ element }) => <div>{element}</div>,
  Navigate: () => null,
  Link: ({ children }) => <a>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '', search: '', hash: '', state: null }),
  useParams: () => ({}),
}), { virtual: true });

test('renders login page heading', () => {
  render(<App />);
  const headerElement = screen.getByRole('heading', { name: /Sign in to your account/i });
  expect(headerElement).toBeInTheDocument();
});
