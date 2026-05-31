import React from 'react';

// Minimal test component
const TestApp: React.FC = () => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '3rem',
        borderRadius: '1rem',
        textAlign: 'center',
        maxWidth: '500px'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          🎉 Atoshi Privacy Wallet
        </h1>
        <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
          ✅ React loaded successfully!
        </p>
        <div style={{
          background: 'rgba(255, 255, 255, 0.2)',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginTop: '1rem'
        }}>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>
            If you can see this page, the basic configuration is working.
          </p>
          <p style={{ fontSize: '0.9rem', margin: '0.5rem 0 0 0' }}>
            You can now load the full wallet interface!
          </p>
        </div>
      </div>
    </div>
  );
};

export default TestApp;

