const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/quiz-app').then(async () => {
  console.log('Connected to MongoDB');
  
  try {
    // Find the user
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const user = await User.findOne({ email: 'daniel@inovitrix.com' });
    
    if (!user) {
      console.log('User daniel@inovitrix.com not found');
      process.exit(1);
    }
    
    console.log('User found:', {
      id: user._id,
      email: user.email,
      userType: user.userType,
      packagesCount: user.packages?.length || 0
    });
    
    // Find the test package
    const Package = mongoose.model('Package', new mongoose.Schema({}, { strict: false }));
    const testPackage = await Package.findOne({ name: 'test package' });
    
    if (!testPackage) {
      console.log('Test package not found');
      process.exit(1);
    }
    
    console.log('Test package found:', {
      id: testPackage._id,
      name: testPackage.name,
      published: testPackage.published
    });
    
    // Check if user already has this package
    const hasPackage = user.packages && user.packages.includes(testPackage._id);
    
    if (hasPackage) {
      console.log('User already has this package assigned');
    } else {
      // Assign package to user
      if (!user.packages) {
        user.packages = [];
      }
      user.packages.push(testPackage._id);
      await user.save();
      console.log('Package assigned to user successfully');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});