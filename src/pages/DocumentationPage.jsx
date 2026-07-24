import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  BookOpen, 
  FileText, 
  Edit3, 
  BarChart3, 
  Download, 
  HelpCircle,
  ArrowLeft,
  User,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import AuthButtons from "../components/auth/AuthButtons";
import ReportBugLink from "../components/ui/ReportBugLink";

import {
  DocumentationNavigation,
  SectionHeader,
  GettingStartedSection,
  DatasetsSection,
  RolesSection,
  AnnotationSection,
  AISegmentationSection,
  QuantificationSection,
  ExportSection,
  TroubleshootingSection
} from "../components/documentation";

const DocumentationPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [expandedSections, setExpandedSections] = useState({
    gettingStarted: true,
    datasets: false,
    roles: false,
    annotation: false,
    aiSegmentation: false,
    quantification: false,
    export: false,
    troubleshooting: false
  });
  const [lastSelectedTab, setLastSelectedTab] = useState('gettingStarted');

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleTabClick = (sectionId) => {
    // Update the last selected tab
    setLastSelectedTab(sectionId);
    
    // Ensure the section is expanded first
    if (!expandedSections[sectionId]) {
      setExpandedSections(prev => ({
        ...prev,
        [sectionId]: true
      }));
    }
    
    // Wait a bit for the section to expand, then scroll
    setTimeout(() => {
      const element = document.getElementById(`section-${sectionId}`);
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        
        // Additional offset for the fixed tabs bar
        const offset = 120; // Account for navbar + tabs bar height
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  const sections = [
    {
      id: "gettingStarted",
      title: "Getting Started",
      icon: BookOpen,
      component: GettingStartedSection
    },
    {
      id: "datasets",
      title: "Dataset Management",
      icon: FileText,
      component: DatasetsSection
    },
    {
      id: "roles",
      title: "Roles & Permissions",
      icon: ShieldCheck,
      component: RolesSection
    },
    {
      id: "annotation",
      title: "Annotation Tools",
      icon: Edit3,
      component: AnnotationSection
    },
    {
      id: "aiSegmentation",
      title: "AI Segmentation",
      icon: BarChart3,
      component: AISegmentationSection
    },
    {
      id: "quantification",
      title: "Quantification Analysis",
      icon: BarChart3,
      component: QuantificationSection
    },
    {
      id: "export",
      title: "Export & Download",
      icon: Download,
      component: ExportSection
    },
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      icon: HelpCircle,
      component: TroubleshootingSection
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Application Navbar */}
      <nav className="bg-teal-600 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-[98%] mx-auto px-4 py-3">
          {/* Mobile Layout */}
          <div className="flex items-center justify-between lg:hidden">
            <button
              onClick={() => navigate("/datasets")}
              className="flex items-center space-x-2 hover:text-teal-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </button>
            <button
              onClick={() => navigate("/")}
              className="text-lg font-bold hover:text-teal-200 transition-colors cursor-pointer"
            >
              IQuana
            </button>
            {isAuthenticated && user && (
              <div className="flex items-center space-x-1 px-2 py-1.5 text-xs text-white">
                <User className="w-3 h-3" />
                <span className="font-medium hidden sm:inline">{user.username}</span>
              </div>
            )}
            <ReportBugLink variant="mobile" />
            {isAuthenticated && (
              <button
                onClick={() => navigate("/datasets")}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white py-1.5 px-3 rounded-lg transition-colors text-sm"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Datasets</span>
              </button>
            )}
            <AuthButtons variant="mobile" showLogoutOnly={true} />
          </div>

          {/* Desktop Layout */}
          <div className="hidden lg:flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate("/datasets")}
                className="flex items-center space-x-2 hover:text-teal-200 transition-colors"
              >
                <BookOpen className="w-5 h-5" />
                <span>Back to Datasets</span>
              </button>
              <div className="h-6 w-px bg-teal-400"></div>
              <button
                onClick={() => navigate("/")}
                className="text-2xl font-bold hover:text-teal-200 transition-colors cursor-pointer"
              >
                IQuana
              </button>
              <div className="h-6 w-px bg-teal-400"></div>
              {isAuthenticated && user && (
                <div className="flex items-center space-x-2 px-3 py-1.5 text-sm text-white">
                  <User className="w-4 h-4" />
                  <span className="font-medium">{user.username}</span>
                </div>
              )}
              <span className="text-lg font-medium">Documentation</span>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAuthenticated && (
                <button
                  onClick={() => navigate("/datasets")}
                  className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Datasets</span>
                </button>
              )}
              <ReportBugLink />
              <AuthButtons showLogoutOnly={true} />
            </div>
          </div>
        </div>
      </nav>

      {/* Documentation Content */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[98%] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-teal-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">User Manual</h1>
            </div>
          </div>
          <p className="text-gray-600 text-base sm:text-lg max-w-4xl">
          A complete guide to use the IQuana application for efficient dataset management, AI-driven image segmentation, and quantification analysis.
          </p>
        </div>
      </div>

      <DocumentationNavigation 
        expandedSections={expandedSections}
        toggleSection={toggleSection}
        onTabClick={handleTabClick}
        lastSelectedTab={lastSelectedTab}
      />

      <div className="max-w-[98%] mx-auto px-4 sm:px-6 py-6 sm:py-8 scroll-mt-20">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {sections.map(({ id, title, icon: Icon, component: Component }) => (
            <SectionHeader
              key={id}
              id={id}
              title={title}
              icon={Icon}
              expanded={expandedSections[id]}
              onToggle={toggleSection}
            >
              <Component />
            </SectionHeader>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DocumentationPage; 