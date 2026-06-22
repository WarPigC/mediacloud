import { useAuth } from '../context/AuthContext';
import FileGrid from '../components/FileGrid';
import AdminFileBrowser from '../components/AdminFileBrowser';

export default function Dashboard() {
  const { user } = useAuth();

  // Admin gets a filesystem explorer with lazy indexing.
  // Regular users get their flat file list.
  if (user?.role === 'admin') {
    return <AdminFileBrowser />;
  }

  return <FileGrid />;
}
