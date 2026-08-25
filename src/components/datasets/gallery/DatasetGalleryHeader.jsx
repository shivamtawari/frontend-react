import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, BookOpen, User } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import AuthButtons from '../../auth/AuthButtons';
import ReportBugLink from '../../ui/ReportBugLink';
import ThemeToggle from '../../ui/ThemeToggle';
import Wordmark from '../../Wordmark';

const DatasetGalleryHeader = ({ datasetName, onStartAnnotation, density = "default" }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const isCompact = density === "compact";

  return (
    <nav className="bg-p1 text-t1 border-b border-ln sticky top-0 z-50">
      <div className={`max-w-full mx-auto px-4 ${isCompact ? "py-1.5" : "py-3"} flex items-center justify-between`}>
        <div className={`flex items-center ${isCompact ? "space-x-3" : "space-x-4"}`}>
          <button
            onClick={() => navigate("/datasets")}
            className={`flex items-center ${isCompact ? "space-x-1.5 text-xs text-t2" : "space-x-2"} hover:text-ac transition-colors duration-150`}
          >
            <ArrowLeft size={isCompact ? 16 : 20} />
            <span>Back to Datasets</span>
          </button>
          <div className={`${isCompact ? "h-4" : "h-6"} w-px bg-ln`}></div>
          <h1 
            className={`${isCompact ? "text-xl" : "text-2xl"} font-bold cursor-pointer hover:text-ac transition-colors duration-150`}
            onClick={() => navigate('/')}
          >
            <Wordmark />
          </h1>
          <div className={`${isCompact ? "h-4" : "h-6"} w-px bg-ln`}></div>
          <span className={`${isCompact ? "text-sm text-t2" : "text-lg"} font-medium`}>{datasetName}</span>
        </div>

        <div className={`flex items-center ${isCompact ? "space-x-3" : "space-x-4"}`}>
          {isAuthenticated && user && (
            <div className={`flex items-center ${isCompact ? "space-x-1.5 px-2 py-1 text-xs" : "space-x-2 px-3 py-1.5 text-sm"} text-t3`}>
              <User className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
              <span className="font-medium">{user.username}</span>
            </div>
          )}
          <button
            onClick={() => navigate("/docs")}
            className={`flex items-center ${isCompact ? "space-x-1.5 py-1 px-3 rounded-md text-xs" : "space-x-2 py-2 px-4 rounded-lg"} bg-hv hover:bg-hv2 text-t2 hover:text-t1 transition-colors`}
          >
            <BookOpen className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            <span>Documentation</span>
          </button>
          <ThemeToggle />
          <ReportBugLink variant="default" />
          
          <AuthButtons showLogoutOnly={true} />
        </div>
      </div>
    </nav>
  );
};

export default DatasetGalleryHeader;

