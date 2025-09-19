import { jsx as _jsx } from "react/jsx-runtime";
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router';
const App = () => {
    return _jsx(RouterProvider, { router: router });
};
export default App;
