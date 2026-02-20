# encoding: ascii-8bit

# Create the overall gemspec
Gem::Specification.new do |s|
  s.name = 'openc3-cosmos-trends'
  s.summary = 'Trend Analysis and Prediction'
  s.description = <<-EOF
    Tool to help analyze trends and make simple predictions based on historical telemetry.
  EOF
  s.license = 'MIT'
  s.authors = ['Clay Kramp']
  s.email = ['clay@openc3.com']
  s.homepage = 'https://github.com/clayandgen/openc3-cosmos-trends'
  s.platform = Gem::Platform::RUBY
  s.required_ruby_version = '>= 3.0'
    s.metadata = {
    'openc3_store_keywords' => 'trends,graph,analysis',
    'source_code_uri' => 'https://github.com/clayandgen/openc3-cosmos-trends',
    'openc3_store_access_type' => 'public'
  }

  if ENV['VERSION']
    s.version = ENV['VERSION'].dup
  else
    time = Time.now.strftime("%Y%m%d%H%M%S")
    s.version = '0.0.0' + ".#{time}"
  end
  s.files = Dir.glob("{targets,lib,public,tools,microservices}/**/*") + %w(Rakefile README.md LICENSE.md plugin.txt)
end
