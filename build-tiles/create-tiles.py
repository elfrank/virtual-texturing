#!/usr/bin/python

'''

TODO:
- Support parameters on the console
- Fix numbers on debug mode when they do not fit the tile
- Test with different size of tiles
- Test non-power-of-two input textures
- Test textures where width != height
- Add more debug text
- Add comments to code
- Create output folder

'''

import sys, getopt

import os

import PIL
from PIL import ImageFont
from PIL import Image
from PIL import ImageDraw

import math
from exceptions import IOError

from subprocess import call
from platform import system

settings = {}

# settings for output formats/extensions
settings['output'] = {}
settings['output'] = {'jpg' : {'format': 'JPEG', 'extension': 'jpg', 'quality' : 95},'png' : {'format': 'PNG', 'extension': 'png'}}

settings['debug'] = {}
settings['debug']['enabled'] = False
settings['debug']['num_levels'] = 9

# settings for generating tiles from a Mip Map level
settings['tile'] = {}
settings['tile']['size'] = 128
settings['tile']['padding_per_side'] = 4

# settings for reading images as input textures on coarser Mip Map level
settings['input'] = {}
settings['input']['texture_types'] = { 'diffuse' : True, 'normal' : False, 'specular' : False }
settings['input']['format'] = 'png'

# directory names for: storing the generated mip maps and tiles; reading the input textures
settings['directories'] = {}
settings['directories']['current'] = os.path.dirname(os.path.abspath(__file__))
settings['directories']['input'] = 'input'
settings['directories']['tiles'] = 'tiles'
settings['directories']['mipmaps'] = 'mipmaps'
settings['directories']['output'] = 'output'

class Model:
	def __init__(self, idx):
		self.id = idx
		self.path_output = os.path.join(settings['directories']['current'], settings['directories']['output']) 
		self.path_model = os.path.join(self.path_output, self.id)
		self.path_tiles = os.path.join(self.path_model, settings['directories']['tiles'])
		self.path_tiles = os.path.join(self.path_tiles, 'jpg')
		self.path_mipmaps = os.path.join(self.path_model, settings['directories']['mipmaps'])
		self.path_mipmaps = os.path.join(self.path_mipmaps, 'jpg')
		self.path_input = os.path.join(settings['directories']['current'], settings['directories']['input'])
		self.path_input = os.path.join(self.path_input, self.id)
		self.input_images = {}
		
	def set_input(self):

		for key,value in settings['input']['texture_types'].iteritems():
			if value is True:
				filename = key+'.'+settings['input']['format']
				path = os.path.join(self.path_input, filename)
				self.input_images[key] = path
				
				if settings['debug']['enabled']:
					max_level = settings['debug']['num_levels']-1
					tile_size = settings['tile']['size']
					size = tile_size*(2**max_level)
					print 'Create %d debug levels (up to %dx%d)' % (max_level+1,size,size)
					img = Image.new("RGB", (size,size),(128,128,128))
					img.save(path, "JPEG", quality=95)
				else:
					img = Image.open(path)
				
				size = img.size[0]
		return size
		
	def run(self):
	
		size = self.set_input()
		level = int(math.log(size/(settings['tile']['size']), 2))

		while level >= 0:	
			for texture_type, value in settings['input']['texture_types'].iteritems():
				if value is not True:
					continue
				
				path_resolution = create_directory(self.path_mipmaps,str(size))
				path_image = self.input_images[texture_type]
			
				mip_map = MipMap(path_image, texture_type, size, level)
				mip_map.save(path_resolution)
			
				path_type = create_directory(self.path_tiles, texture_type)
			
				# create tiles from the texture at current resolution
				mip_map.create_tiles(path_type)

			level = level - 1	
			size = int(size*0.5)

class Tile:
	def __init__(self, level, tile_number, format = 'jpg'):
		self.level = level
		self.tile_number = tile_number
		self.output = settings['output'][format]
		self.filename = '%i-%i.%s' % (self.level, self.tile_number, self.output['extension'])
		self.size = settings['tile']['size']
		self.padding = settings['tile']['padding_per_side']
		self.real_size = self.size+self.padding
		self.image = None
	
	def set_image(self, image):
		self.image = image
	
	def create_box(self, x, y):
		return (x-(self.padding), y-self.padding, x+self.size+self.padding, y+self.size+self.padding)
		
	def save(self, directory):
		path = os.path.join(directory, self.filename)
		
		if settings['debug']['enabled']:
			
			font_directory = '/Library/Fonts/'
			_os = system()
			if _os == 'Linux':
				font_directory = '/usr/share/fonts/'
			elif _os == 'Windows':
				font_directory = ''
				print 'Fix font directory for Windows'

			font_name = 'Courier New.ttf'

			img = Image.new("RGB", (self.size,self.size),(128,20,20))
			self.image.paste(img,(self.padding,self.padding))
			
			font = ImageFont.truetype(font_directory+font_name,30)
			draw = ImageDraw.Draw(self.image)
			
			msg = '%sx%s' % (self.level,self.tile_number)
			x2, y2 = (self.real_size,self.real_size)
			x1, y1 = draw.textsize(msg, font=font)

			draw.text(((x2-x1)/2,(y2-y1)/2), msg, font=font)
		
		try:
			self.image.save(path, self.output['format'], quality=self.output['quality'], progressive=False)
		except IOError:
 			PIL.ImageFile.MAXBLOCK = self.size * self.size
 			self.image.save(path, self.output['format'], quality=self.output['quality'], progressive=False)
		
class MipMap:
	def __init__(self, path, type, resize_to, level, format = 'jpg'):
		self.image = None
		self.resolution = {'x':resize_to, 'y' :resize_to}
		self.type = type
		self.output = settings['output'][format]
		self.filename = '%s-%i.%s' % (type, resize_to, self.output['extension'])
		self.level = level
		self.number_of_tiles = (self.resolution['x']/settings['tile']['size'])*(self.resolution['y']/settings['tile']['size'])
		
		self.image = Image.open(path)
		self.image = self.image.resize((self.resolution['x'], self.resolution['y']), Image.ANTIALIAS)
		self.image = self.image.convert('RGB')
		
	def save(self, directory):
		path = os.path.join(directory, self.filename)
		print '\n* Save MipMap... {Type: \'%s\', Resolution: (%d,%d)} as %s' % (self.type,self.resolution['x'],self.resolution['y'], path)

		self.image.save(path, self.output['format'], quality = self.output['quality'])
		
	def create_tiles(self, path):
		x = 0
		y = 0
		page_number = 0		
		
		print '* Creating %d tile(s) for MipMap level #%d at %s' % (self.number_of_tiles,self.level, path)
		for page_number in range(self.number_of_tiles):
			
			self.create_tile(x, y, page_number, path)
			
			x = x + settings['tile']['size']				
			if x == self.resolution['x']:
				x = 0
				y = y + settings['tile']['size']
		
	def create_tile(self, x, y, page_number, path):
		tile = Tile(self.level, page_number)
		tile.image = self.image.crop(tile.create_box(x,y))
		tile.save(path)

		return tile
		
def create_directory(a,b):
	directory = os.path.join(a,b)
	if not os.path.exists( directory ):
		os.makedirs( directory )

	return directory

# ------------------------------------------------------------------------------
def main(argv):

	input_data = ''
	
	enable_texture = {'diffuse':True, 'normal':False, 'specular':False}
	
	try:
		opts, args = getopt.getopt(argv,"hi:d:s:n:",["input=","enable_texture_diffuse=","enable_texture_specular=","enable_texture_normal="])
	except getopt.GetoptError:
		print 'Errors on arguments'
		#print 'create-tiles.py -i <input>'
		sys.exit(2)
	for opt, arg in opts:
		if opt in ("-h", "--help"):
			#print 'create-tiles.py -i <input>'
			sys.exit()
		elif opt in ("-i", "--input"):
			input_data = arg
		elif opt in ("-d", "--enable_texture_diffuse"):
			enable_texture['diffuse'] = arg
		elif opt in ("-s", "--enable_texture_specular"):
			enable_texture['specular'] = arg
		elif opt in ("-n", "--enable_texture_normal"):
			enable_texture['normal'] = arg
		else:
			print 'Option %s is not supported' % (opt)

	if input_data:

		print 'Input file is ', input_data

		#list_of_models = ['1_military-jacket', '0_leather-jacket-black', '0_leather-jacket-brown', '0_leather-jacket-green', '0_leather-jacket-red']
		#list_of_models = ['2_multiple-models-test-2']
	
		#list_of_models.append()
	
		print '***Global Variables***'
		for key, value in settings.iteritems():
			print key,value
		print '\n'
	
		print '* Create data for model \'%s\'...' % (input_data)
		model = Model(input_data)
		model.run()
		print '* Done.' % ()
	else:
		print "ERROR"
		
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    main(sys.argv[1:])
